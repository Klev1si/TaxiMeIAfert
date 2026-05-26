import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { Client, Company, Driver, PromoCode, Ride, RideStop, Tariff, User } from '../entities/index.js';
import { PromoDiscountType } from '../entities/promo-code.entity.js';
import { PaymentStatus, RideStatus, UserRole, VehicleType } from '../common/enums/index.js';
import { GpsService } from '../gps/gps.service.js';
import { GatewayService } from '../gateway/gateway.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { FraudService } from '../fraud/fraud.service.js';
import { RouteTrackerService } from './route-tracker.service.js';
import { NearestDriverDto } from './dto/nearest-driver.dto.js';
import { RequestRideDto } from './dto/request-ride.dto.js';
import { RideResponseDto, RideStopResponseDto } from './dto/ride-response.dto.js';
import { CancelRideDto } from './dto/cancel-ride.dto.js';
import { RateRideDto } from './dto/rate-ride.dto.js';

/** Seconds a driver has to respond before their pending slot expires */
const PENDING_TTL_SECONDS = 60;

/** Returns the start of the requested reporting period (UTC), or null for 'all'. */
function periodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case 'week': {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - 6);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      const d = new Date(now);
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    default:
      return null;
  }
}

/** Max candidates fetched per geo search when dispatching */
const MAX_CANDIDATES = 20;

// ── Dispatch ranking weights (must sum to 1.0; tunable via env) ────────────
// Each candidate gets a composite score in [0,1]:
//   score = W_DIST*distScore + W_RATING*ratingScore + W_ACCEPT*acceptScore + W_EXP*expScore
// The highest-scoring available driver is offered the ride first.
const DISPATCH_W_DISTANCE   = Number(process.env.DISPATCH_W_DISTANCE   ?? 0.50);
const DISPATCH_W_RATING     = Number(process.env.DISPATCH_W_RATING     ?? 0.25);
const DISPATCH_W_ACCEPTANCE = Number(process.env.DISPATCH_W_ACCEPTANCE ?? 0.15);
const DISPATCH_W_EXPERIENCE = Number(process.env.DISPATCH_W_EXPERIENCE ?? 0.10);
/** Assumed acceptance rate for drivers with no history yet (range 0–1). */
const DISPATCH_NEW_DRIVER_ACCEPT_SCORE = Number(process.env.DISPATCH_NEW_DRIVER_ACCEPT_SCORE ?? 0.70);

// ── No-show configuration ───────────────────────────────────────────────────
const NOSHOW_DRIVER_WAIT_MINUTES = Number(process.env.NOSHOW_DRIVER_WAIT_MINUTES ?? 10);
const NOSHOW_PASSENGER_FEE       = Number(process.env.NOSHOW_PASSENGER_FEE       ?? 5.00);

// ── Cancellation fee configuration (read once at startup) ──────────────────
const CANCEL_GRACE_MINUTES = Number(process.env.CANCEL_GRACE_MINUTES ?? 2);
const CANCEL_FEE_ACCEPTED  = Number(process.env.CANCEL_FEE_ACCEPTED  ?? 2.00);
const CANCEL_FEE_EN_ROUTE  = Number(process.env.CANCEL_FEE_EN_ROUTE  ?? 3.00);
const CANCEL_FEE_ARRIVED   = Number(process.env.CANCEL_FEE_ARRIVED   ?? 5.00);

/**
 * Compute the cancellation fee the CLIENT would owe for cancelling `ride` right now.
 * Returns 0 when the driver is cancelling (fee is never charged to the driver).
 * Returns 0 when the ride is still in REQUESTED state (no driver yet).
 */
function computeCancellationFee(ride: Ride, cancellerRole: UserRole): number {
  // Driver cancellations are always free for the client
  if (cancellerRole !== UserRole.CLIENT) return 0;

  // No driver assigned yet → free
  if (!ride.acceptedAt) return 0;

  // Grace period: free if cancelled within N minutes of acceptance
  const minutesSinceAccepted =
    (Date.now() - new Date(ride.acceptedAt).getTime()) / 60_000;
  if (minutesSinceAccepted <= CANCEL_GRACE_MINUTES) return 0;

  // Driver arrived at pickup → highest fee
  if (ride.pickupArrivedAt) return CANCEL_FEE_ARRIVED;

  // Driver is driving to pickup (en-route)
  if (ride.status === RideStatus.DRIVING_TO_PICKUP) return CANCEL_FEE_EN_ROUTE;

  // Driver accepted but hasn't started driving yet
  return CANCEL_FEE_ACCEPTED;
}

@Injectable()
export class RidesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RidesService.name);
  /** Node timer handle for the scheduled-ride dispatcher (30 s interval) */
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  /** Node timer handle for the scheduled-ride reminder job (5 min interval) */
  private reminderTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,

    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,

    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Tariff)
    private readonly tariffRepo: Repository<Tariff>,

    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(PromoCode)
    private readonly promoRepo: Repository<PromoCode>,

    @InjectRepository(RideStop)
    private readonly rideStopRepo: Repository<RideStop>,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,

    private readonly gpsService: GpsService,
    private readonly gatewayService: GatewayService,
    private readonly notificationsService: NotificationsService,
    private readonly mailerService: MailerService,
    private readonly walletService: WalletService,
    private readonly fraudService: FraudService,
    private readonly routeTracker: RouteTrackerService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 65: Scheduled-ride dispatcher (polls every 30 s via setInterval)
  // ─────────────────────────────────────────────────────────────────────────────

  onModuleInit(): void {
    // Check every 30 seconds for scheduled rides that are now due
    this.schedulerTimer = setInterval(() => {
      this.dispatchScheduledRides().catch((err) =>
        this.logger.error('Scheduled-ride dispatcher error:', err),
      );
    }, 30_000);
    this.logger.log('Scheduled-ride dispatcher started (30 s interval)');

    // Check every 5 minutes for rides that need a 1-hour or 15-minute reminder
    this.reminderTimer = setInterval(() => {
      this.sendScheduledRideReminders().catch((err) =>
        this.logger.error('Scheduled-ride reminder error:', err),
      );
    }, 5 * 60_000);
    // Also fire once immediately on startup so any missed reminders are recovered
    setTimeout(() => {
      this.sendScheduledRideReminders().catch((err) =>
        this.logger.error('Scheduled-ride reminder (initial) error:', err),
      );
    }, 10_000);
    this.logger.log('Scheduled-ride reminder job started (5 min interval)');
  }

  onModuleDestroy(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  /**
   * Finds scheduled rides whose `scheduledAt` is now past (or within the next
   * 30 s window) and still have no assigned driver, then dispatches them.
   *
   * Safety guarantees:
   *  1. Double-dispatch guard  — if a pending offer is already live in Redis
   *     (driver has up to 60 s to respond), we skip that ride this tick.
   *  2. Grace-period expiry    — if scheduledAt + 10 min has passed and we still
   *     could not find a driver, we cancel the ride and push-notify the client.
   *  3. First-dispatch nudge   — on the very first dispatch attempt we send the
   *     client an FCM "we're finding your driver now" notification.
   *  4. Nearest-driver ordering — candidates are already sorted by distance from
   *     buildCandidateList → closest available driver is offered first.
   */
  private async dispatchScheduledRides(): Promise<void> {
    /** How long after scheduledAt we keep trying before giving up */
    const GRACE_MS = 10 * 60 * 1000; // 10 minutes
    /** How early before scheduledAt we offer the ride to a driver.
     *  10 min gives the driver enough time to accept and drive to pickup.
     *  This matches the client-side 10-min minimum lead time, so a driver is
     *  offered the ride at the same moment the client books it. */
    const LEAD_MS = 10 * 60 * 1000; // 10 minutes

    const now = new Date();
    // Dispatch rides whose scheduledAt is in the past OR within the next LEAD_MS
    const windowEnd = new Date(now.getTime() + LEAD_MS);

    const dueRides = await this.rideRepo
      .createQueryBuilder('ride')
      .where('ride.scheduledAt IS NOT NULL')
      .andWhere('ride.scheduledAt <= :windowEnd', { windowEnd })
      .andWhere('ride.driverId IS NULL')
      .andWhere('ride.status = :status', { status: RideStatus.REQUESTED })
      .orderBy('ride.scheduledAt', 'ASC')
      .take(20)
      .getMany();

    for (const ride of dueRides) {
      try {
        // ── 1. Double-dispatch guard ──────────────────────────────────────────
        // If a driver has already been offered this ride and hasn't responded yet
        // (pending key is alive), skip this tick — avoid sending two simultaneous
        // offers for the same ride.
        const pendingKey = `ride:${ride.id}:pending`;
        const alreadyPending = await this.redis.exists(pendingKey);
        if (alreadyPending) {
          this.logger.debug(`Scheduled ride ${ride.id} — offer already pending, skipping tick`);
          continue;
        }

        // ── 2. Grace-period expiry check ─────────────────────────────────────
        const msLate = now.getTime() - ride.scheduledAt!.getTime();
        if (msLate > GRACE_MS) {
          // Tried for 10 minutes — give up, cancel, and notify client
          ride.status       = RideStatus.CANCELLED;
          ride.cancelledAt  = new Date();
          ride.cancelReason = 'No drivers were available at your scheduled time';
          await this.rideRepo.save(ride);
          await this.redis.del(`ride:${ride.id}:declined`);

          const clientUser = await this.getClientUser(ride.clientId);
          if (clientUser) {
            this.gatewayService.emitToUser(clientUser.id, 'ride_cancelled', {
              rideId: ride.id,
              reason: ride.cancelReason,
            });
            await this.notificationsService.sendToToken(clientUser.fcmToken, {
              title: 'Scheduled ride cancelled',
              body: 'Unfortunately no drivers were available at your scheduled time. Please book a new ride.',
              data: { rideId: ride.id, event: 'ride_cancelled' },
            });
          }

          this.logger.warn(
            `Scheduled ride ${ride.id} cancelled — no drivers found within ${GRACE_MS / 60000} min grace period`,
          );
          continue;
        }

        // ── 3. Find candidates (nearest driver first) ─────────────────────────
        // Respect drivers who already declined in this dispatch cycle
        const declinedIds = await this.redis.smembers(`ride:${ride.id}:declined`);
        const candidates = await this.buildCandidateList(
          ride.pickupLat,
          ride.pickupLng,
          5,
          declinedIds,
        );

        if (candidates.length === 0) {
          this.logger.warn(
            `Scheduled ride ${ride.id} — no drivers available (${Math.round(msLate / 60000)} min late), will retry`,
          );

          // Notify the client ONCE that no drivers were found yet — only on the
          // first scheduling attempt, so we don't spam them every 30 s tick.
          // Uses a Redis flag so the warning is sent at most once per ride.
          const warnKey = `ride:${ride.id}:no_drivers_warned`;
          const alreadyWarned = await this.redis.exists(warnKey);
          if (!alreadyWarned && msLate < 60_000) {
            const clientUser = await this.getClientUser(ride.clientId);
            if (clientUser?.fcmToken) {
              await this.notificationsService.sendToToken(clientUser.fcmToken, {
                title: '⏳ Still searching for a driver',
                body:  'No drivers are available yet for your scheduled ride. We\'ll keep trying for the next 10 minutes.',
                data:  { rideId: ride.id, event: 'no_drivers_yet' },
              });
            }
            // 15 min TTL — long enough to cover the entire 10-min grace window
            await this.redis.set(warnKey, '1', 'EX', 15 * 60);
          }
          continue;
        }

        // ── 4. First-dispatch nudge to client (once per ride) ────────────────
        // We're dispatching up to LEAD_MS before pickup, so the message should
        // tell the client we found their driver — not that the ride is starting.
        const firstNudgeKey = `ride:${ride.id}:first_nudge_sent`;
        const alreadyNudged = await this.redis.exists(firstNudgeKey);
        if (!alreadyNudged) {
          const clientUser = await this.getClientUser(ride.clientId);
          if (clientUser) {
            const minutesUntil = Math.max(0, Math.round(-msLate / 60_000));
            const bodyText = minutesUntil > 0
              ? `We found a driver for your ride in ${minutesUntil} min.`
              : 'Your scheduled ride time has arrived. We\'re connecting you with a driver now.';
            await this.notificationsService.sendToToken(clientUser.fcmToken, {
              title: '🚕 Driver found for your scheduled ride',
              body:  bodyText,
              data:  { rideId: ride.id, event: 'scheduled_dispatching' },
            });
          }
          // TTL covers the LEAD_MS + grace period
          await this.redis.set(firstNudgeKey, '1', 'EX', 30 * 60);
        }

        // ── 5. Dispatch to the nearest available driver ───────────────────────
        await this.dispatchToDriver(ride, candidates[0], 5);
        this.logger.log(
          `Scheduled ride ${ride.id} dispatched to driver ${candidates[0].driverId}` +
          ` (${candidates.length} candidates, ${declinedIds.length} previously declined)`,
        );
      } catch (err) {
        this.logger.error(`Failed to dispatch scheduled ride ${ride.id}:`, err);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 67: Scheduled-ride reminder job
  // Sends FCM reminders 1 hour and 15 minutes before a scheduled ride.
  // Redis flags prevent duplicate sends across restarts / multiple ticks.
  // ─────────────────────────────────────────────────────────────────────────────

  private async sendScheduledRideReminders(): Promise<void> {
    const now = new Date();

    // ── Window definitions ────────────────────────────────────────────────────
    // 1-hour reminder: rides scheduled between now+55min and now+65min
    const oneHourWindowStart = new Date(now.getTime() + 55 * 60_000);
    const oneHourWindowEnd   = new Date(now.getTime() + 65 * 60_000);

    // 15-minute reminder: rides scheduled between now+12min and now+18min
    const fifteenMinWindowStart = new Date(now.getTime() + 12 * 60_000);
    const fifteenMinWindowEnd   = new Date(now.getTime() + 18 * 60_000);

    // Fetch rides in either window (REQUESTED, no driver yet)
    const upcomingRides = await this.rideRepo
      .createQueryBuilder('ride')
      .where('ride.scheduledAt IS NOT NULL')
      .andWhere('ride.status = :status', { status: RideStatus.REQUESTED })
      .andWhere('ride.driverId IS NULL')
      .andWhere(
        '(ride.scheduledAt BETWEEN :oneHourStart AND :oneHourEnd) OR' +
        ' (ride.scheduledAt BETWEEN :fifteenMinStart AND :fifteenMinEnd)',
        {
          oneHourStart:     oneHourWindowStart,
          oneHourEnd:       oneHourWindowEnd,
          fifteenMinStart:  fifteenMinWindowStart,
          fifteenMinEnd:    fifteenMinWindowEnd,
        },
      )
      .getMany();

    for (const ride of upcomingRides) {
      const clientUser = await this.getClientUser(ride.clientId);
      if (!clientUser?.fcmToken) continue;

      const scheduledMs = ride.scheduledAt!.getTime();
      const minutesAway = Math.round((scheduledMs - now.getTime()) / 60_000);

      // ── 1-hour reminder ───────────────────────────────────────────────────
      if (scheduledMs >= oneHourWindowStart.getTime() && scheduledMs <= oneHourWindowEnd.getTime()) {
        const reminderKey = `ride:${ride.id}:reminder_1h`;
        const alreadySent = await this.redis.exists(reminderKey);
        if (!alreadySent) {
          await this.notificationsService.sendToToken(clientUser.fcmToken, {
            title: '🕐 Ride reminder — 1 hour away',
            body: `Your scheduled ride is in about ${minutesAway} minutes. Make sure you're ready!`,
            data: { event: 'scheduled_reminder', rideId: ride.id },
          });
          // Expire flag after 90 min so it doesn't linger forever
          await this.redis.set(reminderKey, '1', 'EX', 90 * 60);
          this.logger.log(`1-hour reminder sent for scheduled ride ${ride.id}`);
        }
      }

      // ── 15-minute reminder ────────────────────────────────────────────────
      if (scheduledMs >= fifteenMinWindowStart.getTime() && scheduledMs <= fifteenMinWindowEnd.getTime()) {
        const reminderKey = `ride:${ride.id}:reminder_15m`;
        const alreadySent = await this.redis.exists(reminderKey);
        if (!alreadySent) {
          await this.notificationsService.sendToToken(clientUser.fcmToken, {
            title: '🚕 Your ride is almost here!',
            body: `Your scheduled ride is in about ${minutesAway} minutes. Your driver is being assigned now.`,
            data: { event: 'scheduled_reminder', rideId: ride.id },
          });
          await this.redis.set(reminderKey, '1', 'EX', 30 * 60);
          this.logger.log(`15-minute reminder sent for scheduled ride ${ride.id}`);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 53: GET /rides/estimate  (CLIENT — fare estimate before booking)
  // ─────────────────────────────────────────────────────────────────────────────
  async estimateFare(
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
    vehicleType?: VehicleType | null,
  ) {
    // Prefer Google Maps Distance Matrix (real road distance + realistic duration).
    // Falls back to Haversine + 30 km/h average if the key is absent or the call fails.
    let distanceKm: number;
    let durationMinutes: number;

    const dmResult = await this.getDistanceMatrixRoute(
      pickupLat, pickupLng, dropoffLat, dropoffLng,
    );

    if (dmResult) {
      distanceKm     = dmResult.distanceKm;
      durationMinutes = dmResult.durationMinutes;
    } else {
      distanceKm     = this.haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
      durationMinutes = (distanceKm / 30) * 60;
    }

    // Select the best matching global tariff for the current time of day.
    // selectActiveTariff(null) picks from platform-wide tariffs (companyId IS NULL)
    // and prefers a vehicle-type-specific tariff when vehicleType is provided.
    const tariff = await this.selectActiveTariff(null, new Date(), vehicleType);

    let estimatedFare:  number | null = null;
    let breakdown:      object | null = null;
    let tariffName:     string | null = null;
    let isNightTariff:  boolean       = false;

    if (tariff) {
      const surge = Math.max(1, Number(tariff.surgeMultiplier ?? 1));
      const raw =
        Number(tariff.baseFare) +
        distanceKm * Number(tariff.perKmRate) +
        durationMinutes * Number(tariff.perMinuteRate);
      const afterMinimum = Math.max(raw, Number(tariff.minimumFare));
      estimatedFare = Math.round(afterMinimum * surge * 100) / 100;
      breakdown = {
        baseFare:        Number(tariff.baseFare),
        perKmRate:       Number(tariff.perKmRate),
        perMinuteRate:   Number(tariff.perMinuteRate),
        minimumFare:     Number(tariff.minimumFare),
        surgeMultiplier: surge,
      };
      tariffName    = tariff.name;
      isNightTariff = tariff.isNightTariff;
    }

    return {
      distanceKm:      Math.round(distanceKm  * 100) / 100,
      durationMinutes: Math.round(durationMinutes * 10) / 10,
      estimatedFare,
      breakdown,
      tariffName,
      vehicleType:     vehicleType ?? null,
      isNightTariff,
      surgeMultiplier: tariff ? Math.max(1, Number(tariff.surgeMultiplier ?? 1)) : 1,
      surgeActive:     tariff ? Number(tariff.surgeMultiplier ?? 1) > 1 : false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 17: GET /rides/nearest-drivers
  // ─────────────────────────────────────────────────────────────────────────────
  async findNearestDrivers(
    lat: number,
    lng: number,
    radiusKm: number,
    limit: number,
    vehicleType?: VehicleType | null,
  ): Promise<NearestDriverDto[]> {
    const geoResults = await this.gpsService.findNearestDrivers(lat, lng, radiusKm, limit);
    if (geoResults.length === 0) return [];

    const driverIds = geoResults.map((r) => r.driverId);
    const whereClause: FindOptionsWhere<Driver> = { id: In(driverIds), isApproved: true };
    if (vehicleType) whereClause.vehicleType = vehicleType;

    const drivers = await this.driverRepo.find({
      where: whereClause,
      select: [
        'id', 'firstName', 'lastName',
        'vehicleMake', 'vehicleModel', 'vehicleYear',
        'vehiclePlate', 'vehicleColor', 'vehicleType', 'rating',
      ],
    });

    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    const results: NearestDriverDto[] = [];
    for (const geo of geoResults) {
      const d = driverMap.get(geo.driverId);
      if (!d) continue;
      results.push({
        driverId: geo.driverId,
        distanceKm: geo.distanceKm,
        lat: geo.lat,
        lng: geo.lng,
        firstName: d.firstName,
        lastName: d.lastName,
        vehicleMake: d.vehicleMake,
        vehicleModel: d.vehicleModel,
        vehicleYear: d.vehicleYear,
        vehiclePlate: d.vehiclePlate,
        vehicleColor: d.vehicleColor,
        vehicleType: d.vehicleType,
        rating: Number(d.rating),
      });
    }

    this.logger.debug(
      `Nearest drivers: found ${results.length} within ${radiusKm} km of (${lat},${lng})`,
    );
    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 84: Promo code validation — GET /rides/validate-promo?code=XXX
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validates a promo code without applying it.
   * Returns details so the client can preview the discount before booking.
   */
  async validatePromo(code: string, estimatedFare?: number) {
    const promo = await this.findValidPromo(code);
    if (!promo) throw new NotFoundException('Promo code not found or no longer valid');

    const discount = estimatedFare != null
      ? this.computeDiscount(promo, estimatedFare)
      : null;

    return {
      valid:            true,
      code:             promo.code,
      description:      promo.description,
      discountType:     promo.discountType,
      discountValue:    Number(promo.discountValue),
      maxDiscountAmount: promo.maxDiscountAmount != null ? Number(promo.maxDiscountAmount) : null,
      minimumFare:      promo.minimumFare != null ? Number(promo.minimumFare) : null,
      expiresAt:        promo.expiresAt,
      usesRemaining:    promo.maxUses != null ? promo.maxUses - promo.usedCount : null,
      discountAmount:   discount,
    };
  }

  /** Finds an active, non-expired, non-exhausted promo code (case-insensitive). */
  private async findValidPromo(code: string): Promise<PromoCode | null> {
    const upper = code.trim().toUpperCase();
    const promo = await this.promoRepo.findOne({ where: { code: upper, isActive: true } });
    if (!promo) return null;
    if (promo.expiresAt && promo.expiresAt < new Date()) return null;
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return null;
    return promo;
  }

  /** Computes the discount amount given a promo and fare. Returns the amount to deduct. */
  private computeDiscount(promo: PromoCode, fare: number): number {
    let discount: number;
    if (promo.discountType === PromoDiscountType.PERCENT) {
      discount = fare * (Number(promo.discountValue) / 100);
      if (promo.maxDiscountAmount != null) {
        discount = Math.min(discount, Number(promo.maxDiscountAmount));
      }
    } else {
      discount = Number(promo.discountValue);
    }
    // Never discount more than the fare itself
    return Math.min(Math.round(discount * 100) / 100, fare);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 18: POST /rides/request  (CLIENT only)
  // ─────────────────────────────────────────────────────────────────────────────
  async requestRide(clientUserId: string, dto: RequestRideDto): Promise<RideResponseDto> {
    // 1. Resolve client record
    const client = await this.clientRepo.findOne({ where: { userId: clientUserId } });
    if (!client) throw new NotFoundException('Client profile not found');

    // 1b. Fraud: prevent duplicate active rides
    const activeRideId = await this.fraudService.checkConcurrentRide(client.id, clientUserId);
    if (activeRideId) {
      throw new BadRequestException(
        'You already have an active ride. Please complete or cancel it before requesting a new one.',
      );
    }

    const radiusKm = dto.radiusKm ?? 5;

    // ── Scheduled ride validation ─────────────────────────────────────────────
    let scheduledAt: Date | null = null;
    if (dto.scheduledAt) {
      const scheduled = new Date(dto.scheduledAt);
      const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
      if (isNaN(scheduled.getTime())) {
        throw new BadRequestException('scheduledAt is not a valid date');
      }
      if (scheduled < tenMinutesFromNow) {
        throw new BadRequestException('scheduledAt must be at least 10 minutes in the future');
      }
      scheduledAt = scheduled;
    }

    // 2. For immediate rides: find nearest online, approved drivers (live Redis geo)
    //    For scheduled rides: skip driver search now — the scheduler dispatches later
    let candidates: Array<{ driverId: string; userId: string; lat: number; lng: number }> = [];
    if (!scheduledAt) {
      candidates = await this.buildCandidateList(
        dto.pickupLat,
        dto.pickupLng,
        radiusKm,
        [],
        dto.vehicleType ?? null,
      );

      if (candidates.length === 0) {
        const typeLabel = dto.vehicleType ? ` (${dto.vehicleType})` : '';
        throw new NotFoundException(`No${typeLabel} drivers available in your area`);
      }
    }

    // 3. Resolve promo code (if supplied)
    let appliedPromo: PromoCode | null = null;
    let discountAmount: number | null = null;

    if (dto.promoCode) {
      appliedPromo = await this.findValidPromo(dto.promoCode);
      if (!appliedPromo) {
        throw new BadRequestException('Promo code is invalid, expired, or has reached its usage limit');
      }
      // If the client provides a fare estimate we can pre-compute the discount;
      // the final discount is locked in when the ride completes (same formula).
      // We store the code now so completeRide can apply it.
    }

    // 4. Create ride record with REQUESTED status
    const ride = this.rideRepo.create({
      clientId: client.id,
      status: RideStatus.REQUESTED,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      pickupAddress: dto.pickupAddress ?? null,
      dropoffLat: dto.dropoffLat ?? null,
      dropoffLng: dto.dropoffLng ?? null,
      dropoffAddress: dto.dropoffAddress ?? null,
      vehicleType: dto.vehicleType ?? null,
      scheduledAt,
      promoCode: appliedPromo?.code ?? null,
      discountAmount,
    });
    const savedRide = await this.rideRepo.save(ride);

    // 4b. Persist intermediate stops (if any)
    if (dto.stops && dto.stops.length > 0) {
      const stopEntities = dto.stops.map((s, i) =>
        this.rideStopRepo.create({
          rideId:    savedRide.id,
          sortOrder: i,
          lat:       s.lat,
          lng:       s.lng,
          address:   s.address ?? null,
          reachedAt: null,
        }),
      );
      await this.rideStopRepo.save(stopEntities);
      (savedRide as any).__stops = stopEntities; // attach for toDto
    }

    // Increment promo usage counter atomically
    if (appliedPromo) {
      await this.promoRepo.increment({ id: appliedPromo.id }, 'usedCount', 1);
    }

    if (scheduledAt) {
      // Scheduled ride — hold until the dispatcher picks it up.
      // Send the client a booking-confirmation push so they have proof in their
      // notification tray even if they close the app immediately.
      const schedUser = await this.userRepo.findOne({
        where: { id: client.userId },
        select: ['fcmToken'],
      });
      const timeLabel = scheduledAt.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
      await this.notificationsService.sendToToken(schedUser?.fcmToken, {
        title: '🗓 Ride scheduled!',
        body: `Your ride is confirmed for ${timeLabel}. We'll find a driver automatically when the time arrives.`,
        data: { rideId: savedRide.id, event: 'ride_scheduled' },
      });

      this.logger.log(
        `Scheduled ride ${savedRide.id} created for ${scheduledAt.toISOString()} by client ${client.id}`,
      );
    } else {
      // 4. Immediate ride — dispatch to first candidate right now
      await this.dispatchToDriver(savedRide, candidates[0], radiusKm);
      this.logger.log(`Ride ${savedRide.id} requested by client ${client.id}`);
    }

    return this.toDto(savedRide);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 18: POST /rides/:id/accept  (DRIVER only)
  // ─────────────────────────────────────────────────────────────────────────────
  async acceptRide(driverUserId: string, rideId: string): Promise<RideResponseDto> {
    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.status !== RideStatus.REQUESTED) {
      throw new ForbiddenException(`Ride is already ${ride.status}`);
    }

    // Verify this driver is the one currently being asked
    const pendingKey = `ride:${rideId}:pending`;
    const pendingDriverId = await this.redis.get(pendingKey);
    if (pendingDriverId !== driver.id) {
      throw new ForbiddenException('You are not the assigned driver for this ride');
    }

    // Accept: update ride
    ride.driverId  = driver.id;
    ride.companyId = driver.companyId;
    ride.status    = RideStatus.ACCEPTED;
    ride.acceptedAt = new Date();

    // Auto-assign a tariff so fare can be calculated on complete.
    // Uses selectActiveTariff() which prefers a matching night tariff when
    // the current UTC hour falls inside the tariff's nightStartHour–nightEndHour
    // window, otherwise falls back to the regular day tariff.
    {
      const tariff = await this.selectActiveTariff(driver.companyId, new Date());
      if (tariff) {
        ride.tariffId = tariff.id;
        this.logger.debug(
          `Ride ${ride.id}: assigned tariff "${tariff.name}"` +
          (tariff.isNightTariff ? ' (night tariff)' : ''),
        );
      }
    }

    const updatedRide = await this.rideRepo.save(ride);

    // Clean up Redis keys
    await this.redis.del(
      pendingKey,
      `ride:${rideId}:declined`,
    );

    // Track acceptance for dispatch scoring (fire-and-forget)
    void this.driverRepo.increment({ id: driver.id }, 'totalAccepted', 1);

    // Notify client via WebSocket + FCM
    const clientUser = await this.getClientUser(ride.clientId);
    const ridePayload = {
      rideId: updatedRide.id,
      driverId: driver.id,
      driverName: `${driver.firstName} ${driver.lastName}`,
      vehicleMake: driver.vehicleMake,
      vehicleModel: driver.vehicleModel,
      vehiclePlate: driver.vehiclePlate,
      vehicleColor: driver.vehicleColor,
    };

    if (clientUser) {
      this.gatewayService.emitToUser(clientUser.id, 'ride_accepted', ridePayload);
      await this.notificationsService.sendToToken(clientUser.fcmToken, {
        title: 'Driver on the way!',
        body: `${driver.firstName} accepted your ride and is heading to you.`,
        data: { rideId: updatedRide.id, event: 'ride_accepted' },
      });

      // Cache the mapping so the GPS gateway can relay live location to this client
      await this.redis.set(
        `driver:active_client:${driver.id}`,
        clientUser.id,
        'EX',
        7200, // 2-hour TTL — auto-expires even if complete/cancel misses it
      );

      // Reverse mapping — used by the chat relay: client sends → find driver's userId
      await this.redis.set(
        `client:active_driver_user:${clientUser.id}`,
        driverUserId,
        'EX',
        7200,
      );

      // Cache pickup coords so the GPS gateway can compute ETA without a DB hit
      await this.redis.set(
        `driver:pickup_coords:${driver.id}`,
        JSON.stringify({ lat: ride.pickupLat, lng: ride.pickupLng }),
        'EX',
        7200,
      );

      // Cache ride→company mapping so the chat relay can route messages to the
      // company dashboard room even when the message comes from the client side
      // (client socket doesn't have companyId in its data).
      if (driver.companyId) {
        await this.redis.set(
          `ride:company:${rideId}`,
          driver.companyId,
          'EX',
          86_400, // 24 h — outlives the ride so company can review after completion
        );
      }
    }

    this.logger.log(`Ride ${rideId} accepted by driver ${driver.id}`);
    await this.attachStops([updatedRide]);
    return this.toDto(updatedRide);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 18: POST /rides/:id/decline  (DRIVER only)
  // ─────────────────────────────────────────────────────────────────────────────
  async declineRide(driverUserId: string, rideId: string): Promise<{ message: string }> {
    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.status !== RideStatus.REQUESTED) {
      throw new ForbiddenException(`Ride is already ${ride.status}`);
    }

    // Verify this driver is the pending one
    const pendingKey = `ride:${rideId}:pending`;
    const pendingDriverId = await this.redis.get(pendingKey);
    if (pendingDriverId !== driver.id) {
      throw new ForbiddenException('You are not the assigned driver for this ride');
    }

    // Mark driver as declined in Redis
    const declinedKey = `ride:${rideId}:declined`;
    await this.redis.sadd(declinedKey, driver.id);
    await this.redis.del(pendingKey);

    // Track decline for dispatch scoring (fire-and-forget)
    void this.driverRepo.increment({ id: driver.id }, 'totalDeclined', 1);

    const isScheduled = ride.scheduledAt !== null;

    // For scheduled rides: keep the declined set alive for the full grace window
    // (15 min) so the scheduler knows not to re-offer to the same drivers.
    // For immediate rides: TTL doesn't matter — it's cleaned up on cancel/accept.
    if (isScheduled) {
      await this.redis.expire(declinedKey, 15 * 60); // 15 min TTL
    }

    // Retrieve all already-declined driver IDs
    const declinedIds = await this.redis.smembers(declinedKey);

    // Find next available driver (excluding all who declined)
    const radiusKm = 5;
    const candidates = await this.buildCandidateList(
      ride.pickupLat,
      ride.pickupLng,
      radiusKm,
      declinedIds,
    );

    if (candidates.length === 0) {
      if (isScheduled) {
        // For scheduled rides: don't cancel yet — new drivers may come online.
        // The dispatcher will retry every 30 s until the 10-min grace period expires.
        this.logger.log(
          `Scheduled ride ${rideId} — all current candidates declined, scheduler will retry`,
        );
        return { message: 'No drivers available right now; will retry automatically' };
      }

      // Immediate ride — no drivers left, cancel now
      ride.status = RideStatus.CANCELLED;
      ride.cancelledAt = new Date();
      ride.cancelReason = 'No available drivers';
      await this.rideRepo.save(ride);
      await this.redis.del(declinedKey);

      const clientUser = await this.getClientUser(ride.clientId);
      if (clientUser) {
        this.gatewayService.emitToUser(clientUser.id, 'ride_cancelled', {
          rideId,
          reason: 'No available drivers',
        });
        await this.notificationsService.sendToToken(clientUser.fcmToken, {
          title: 'No drivers available',
          body: 'All nearby drivers are busy. Please try again in a moment.',
          data: { rideId, event: 'ride_cancelled' },
        });
      }

      this.logger.log(`Ride ${rideId} cancelled — no drivers left`);
      return { message: 'No drivers available; ride cancelled' };
    }

    // Dispatch to next candidate
    await this.dispatchToDriver(ride, candidates[0], radiusKm);
    this.logger.log(
      `Ride ${rideId} declined by ${driver.id}, re-dispatched to ${candidates[0].driverId}`,
    );
    return { message: 'Ride passed to next available driver' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 90: GET /rides/:id/cancellation-fee  — preview fee before confirming
  // ─────────────────────────────────────────────────────────────────────────────
  async getCancellationFee(
    userId: string,
    userRole: UserRole,
    rideId: string,
  ): Promise<{ fee: number; isFree: boolean; reason: string }> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    // Verify the requester owns this ride
    if (userRole === UserRole.CLIENT) {
      const client = await this.clientRepo.findOne({ where: { userId } });
      if (!client || ride.clientId !== client.id) {
        throw new ForbiddenException('This is not your ride');
      }
    } else if (userRole === UserRole.DRIVER) {
      const driver = await this.driverRepo.findOne({ where: { userId } });
      if (!driver || ride.driverId !== driver.id) {
        throw new ForbiddenException('You are not the driver for this ride');
      }
    }

    const fee = computeCancellationFee(ride, userRole);
    let reason = 'No fee applies.';

    if (userRole !== UserRole.CLIENT) {
      reason = 'Drivers are not charged a cancellation fee.';
    } else if (!ride.acceptedAt) {
      reason = 'The ride has not been accepted yet — cancellation is free.';
    } else {
      const minutesSinceAccepted =
        (Date.now() - new Date(ride.acceptedAt).getTime()) / 60_000;
      if (minutesSinceAccepted <= CANCEL_GRACE_MINUTES) {
        reason = `You are within the ${CANCEL_GRACE_MINUTES}-minute grace period — cancellation is free.`;
      } else if (ride.pickupArrivedAt) {
        reason = `Your driver has already arrived at the pickup point.`;
      } else if (ride.status === RideStatus.DRIVING_TO_PICKUP) {
        reason = 'Your driver is already on the way to pick you up.';
      } else {
        reason = 'The driver has accepted but the grace period has passed.';
      }
    }

    return { fee, isFree: fee === 0, reason };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 91: POST /rides/:id/no-show  (CLIENT or DRIVER)
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * DRIVER reports passenger no-show:
   *   - Allowed when status=DRIVING_TO_PICKUP and pickupArrivedAt is set
   *   - Cancels ride, charges NOSHOW_PASSENGER_FEE to client, notifies client
   *
   * CLIENT reports driver no-show:
   *   - Allowed when status=ACCEPTED or DRIVING_TO_PICKUP (driver hasn't arrived)
   *     AND the driver has been accepted for ≥ NOSHOW_DRIVER_WAIT_MINUTES
   *   - Cancels ride free of charge, notifies driver
   */
  async reportNoShow(
    userId: string,
    userRole: UserRole,
    rideId: string,
  ): Promise<RideResponseDto> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    if (userRole === UserRole.DRIVER) {
      // ── Passenger no-show reported by driver ─────────────────────────────
      const driver = await this.driverRepo.findOne({ where: { userId } });
      if (!driver) throw new NotFoundException('Driver profile not found');
      if (ride.driverId !== driver.id) {
        throw new ForbiddenException('You are not the driver for this ride');
      }

      if (ride.status !== RideStatus.DRIVING_TO_PICKUP) {
        throw new ForbiddenException(
          `Passenger no-show can only be reported when status is 'driving_to_pickup' (current: '${ride.status}')`,
        );
      }
      if (!ride.pickupArrivedAt) {
        throw new ForbiddenException(
          'You must mark yourself as arrived at pickup before reporting a passenger no-show.',
        );
      }

      // Cancel and charge the passenger
      ride.status = RideStatus.CANCELLED;
      ride.cancelledAt = new Date();
      ride.cancelledBy = UserRole.DRIVER;
      ride.cancelReason = 'Passenger no-show';
      ride.cancellationFee = NOSHOW_PASSENGER_FEE;
      ride.noShowReportedBy = UserRole.DRIVER;
      const saved = await this.rideRepo.save(ride);

      // Clean up Redis
      await this.redis.del(
        `ride:${rideId}:pending`,
        `ride:${rideId}:declined`,
        `driver:active_client:${driver.id}`,
        `driver:pickup_coords:${driver.id}`,
      );

      // Notify the client
      const clientUser = await this.getClientUser(ride.clientId);
      if (clientUser) {
        this.gatewayService.emitToUser(clientUser.id, 'ride_cancelled', {
          rideId,
          cancelledBy: 'driver',
          reason: 'Passenger no-show',
        });
        await this.notificationsService.sendToToken(clientUser.fcmToken, {
          title: 'Ride cancelled — no-show',
          body: `Your driver reported you as a no-show. A $${NOSHOW_PASSENGER_FEE.toFixed(2)} fee has been applied.`,
          data: { rideId, event: 'ride_cancelled' },
        });
      }

      this.logger.log(
        `Ride ${rideId}: passenger no-show reported by driver ${driver.id}. Fee: $${NOSHOW_PASSENGER_FEE}`,
      );
      return this.toDto(saved);

    } else if (userRole === UserRole.CLIENT) {
      // ── Driver no-show reported by client ────────────────────────────────
      const client = await this.clientRepo.findOne({ where: { userId } });
      if (!client) throw new NotFoundException('Client profile not found');
      if (ride.clientId !== client.id) {
        throw new ForbiddenException('This is not your ride');
      }

      const reportableStatuses: RideStatus[] = [RideStatus.ACCEPTED, RideStatus.DRIVING_TO_PICKUP];
      if (!reportableStatuses.includes(ride.status)) {
        throw new ForbiddenException(
          `Driver no-show can only be reported when status is 'accepted' or 'driving_to_pickup' (current: '${ride.status}')`,
        );
      }
      // Reject if driver has already arrived
      if (ride.pickupArrivedAt) {
        throw new ForbiddenException(
          'Your driver has already arrived at the pickup point.',
        );
      }
      // Enforce minimum wait time
      if (!ride.acceptedAt) {
        throw new ForbiddenException('The ride has not been accepted yet.');
      }
      const minutesWaited = (Date.now() - new Date(ride.acceptedAt).getTime()) / 60_000;
      if (minutesWaited < NOSHOW_DRIVER_WAIT_MINUTES) {
        const remaining = Math.ceil(NOSHOW_DRIVER_WAIT_MINUTES - minutesWaited);
        throw new ForbiddenException(
          `Please wait at least ${NOSHOW_DRIVER_WAIT_MINUTES} minutes after the driver accepts before reporting a no-show. ${remaining} minute(s) remaining.`,
        );
      }

      // Cancel free of charge
      ride.status = RideStatus.CANCELLED;
      ride.cancelledAt = new Date();
      ride.cancelledBy = UserRole.CLIENT;
      ride.cancelReason = 'Driver no-show';
      ride.cancellationFee = null;
      ride.noShowReportedBy = UserRole.CLIENT;
      const saved = await this.rideRepo.save(ride);

      // Clean up Redis
      await this.redis.del(`ride:${rideId}:pending`, `ride:${rideId}:declined`);
      if (ride.driverId) {
        const noShowClientUser = await this.getClientUser(ride.clientId);
        await this.redis.del(
          `driver:active_client:${ride.driverId}`,
          `driver:pickup_coords:${ride.driverId}`,
          ...(noShowClientUser ? [`client:active_driver_user:${noShowClientUser.id}`] : []),
        );
      }

      // Notify the driver
      if (ride.driverId) {
        const driver = await this.driverRepo.findOne({
          where: { id: ride.driverId },
          select: ['userId', 'firstName'],
        });
        if (driver) {
          this.gatewayService.emitToUser(driver.userId, 'ride_cancelled', {
            rideId,
            cancelledBy: 'client',
            reason: 'Driver no-show reported by client',
          });
          const driverUser = await this.userRepo.findOne({
            where: { id: driver.userId },
            select: ['fcmToken'],
          });
          await this.notificationsService.sendToToken(driverUser?.fcmToken, {
            title: 'Ride cancelled — driver no-show',
            body: 'The client reported you as a no-show and the ride has been cancelled.',
            data: { rideId, event: 'ride_cancelled' },
          });
        }
      }

      this.logger.log(`Ride ${rideId}: driver no-show reported by client ${client.id}.`);
      return this.toDto(saved);

    } else {
      throw new ForbiddenException('Only clients and drivers can report a no-show');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 20: POST /rides/:id/cancel  (CLIENT or DRIVER)
  // ─────────────────────────────────────────────────────────────────────────────
  async cancelRide(
    userId: string,
    userRole: UserRole,
    rideId: string,
    dto: CancelRideDto,
  ): Promise<RideResponseDto> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    // ── Determine who is cancelling and validate permissions ─────────────────
    if (userRole === UserRole.CLIENT) {
      // Resolve the client record
      const client = await this.clientRepo.findOne({ where: { userId } });
      if (!client) throw new NotFoundException('Client profile not found');
      if (ride.clientId !== client.id) {
        throw new ForbiddenException('This is not your ride');
      }

      const cancellableStatuses: RideStatus[] = [
        RideStatus.REQUESTED,
        RideStatus.ACCEPTED,
        RideStatus.DRIVING_TO_PICKUP,
      ];
      if (!cancellableStatuses.includes(ride.status)) {
        throw new ForbiddenException(
          `Client cannot cancel a ride with status '${ride.status}'`,
        );
      }
    } else if (userRole === UserRole.DRIVER) {
      const driver = await this.driverRepo.findOne({ where: { userId } });
      if (!driver) throw new NotFoundException('Driver profile not found');
      if (ride.driverId !== driver.id) {
        throw new ForbiddenException('You are not the driver for this ride');
      }

      const cancellableStatuses: RideStatus[] = [
        RideStatus.ACCEPTED,
        RideStatus.DRIVING_TO_PICKUP,
      ];
      if (!cancellableStatuses.includes(ride.status)) {
        throw new ForbiddenException(
          `Driver cannot cancel a ride with status '${ride.status}'`,
        );
      }
    } else {
      throw new ForbiddenException('Only clients and drivers can cancel rides');
    }

    // ── Compute cancellation fee (only charged to client) ────────────────────
    const fee = computeCancellationFee(ride, userRole);

    // ── Persist cancellation ──────────────────────────────────────────────────
    ride.status = RideStatus.CANCELLED;
    ride.cancelledAt = new Date();
    ride.cancelledBy = userRole;
    ride.cancelReason = dto.reason ?? null;
    ride.cancellationFee = fee > 0 ? fee : null;
    const saved = await this.rideRepo.save(ride);

    // Clean up any pending/declined Redis keys (ride may have been in request phase)
    await this.redis.del(`ride:${rideId}:pending`, `ride:${rideId}:declined`);

    // Remove live-location relay, chat reverse, and ETA pickup-coords keys if a driver was assigned
    if (ride.driverId) {
      const cancelClientUser = await this.getClientUser(ride.clientId);
      await this.redis.del(
        `driver:active_client:${ride.driverId}`,
        `driver:pickup_coords:${ride.driverId}`,
        ...(cancelClientUser ? [`client:active_driver_user:${cancelClientUser.id}`] : []),
      );
      // Clear route-tracking binding (no-op if ride never started)
      void this.routeTracker.clearActiveRide(ride.driverId);
    }

    // ── Notify the other party ────────────────────────────────────────────────
    if (userRole === UserRole.CLIENT) {
      // Notify the assigned driver (if any)
      if (ride.driverId) {
        const driver = await this.driverRepo.findOne({
          where: { id: ride.driverId },
          select: ['userId', 'firstName'],
        });
        if (driver) {
          this.gatewayService.emitToUser(driver.userId, 'ride_cancelled', {
            rideId,
            cancelledBy: 'client',
            reason: ride.cancelReason,
          });
          const driverUser = await this.userRepo.findOne({
            where: { id: driver.userId },
            select: ['fcmToken'],
          });
          await this.notificationsService.sendToToken(driverUser?.fcmToken, {
            title: 'Ride cancelled by client',
            body: ride.cancelReason
              ? `Reason: ${ride.cancelReason}`
              : 'The client cancelled the ride.',
            data: { rideId, event: 'ride_cancelled' },
          });
        }
      }
    } else {
      // Notify the client
      const clientUser = await this.getClientUser(ride.clientId);
      if (clientUser) {
        this.gatewayService.emitToUser(clientUser.id, 'ride_cancelled', {
          rideId,
          cancelledBy: 'driver',
          reason: ride.cancelReason,
        });
        await this.notificationsService.sendToToken(clientUser.fcmToken, {
          title: 'Ride cancelled by driver',
          body: ride.cancelReason
            ? `Reason: ${ride.cancelReason}`
            : 'Your driver cancelled the ride.',
          data: { rideId, event: 'ride_cancelled' },
        });
      }
    }

    this.logger.log(
      `Ride ${rideId} cancelled by ${userRole} (userId: ${userId})` +
        (ride.cancelReason ? ` — reason: ${ride.cancelReason}` : ''),
    );
    return this.toDto(saved);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 19: POST /rides/:id/en-route  (DRIVER only)
  // ─────────────────────────────────────────────────────────────────────────────
  async markEnRoute(driverUserId: string, rideId: string): Promise<RideResponseDto> {
    const { driver, ride } = await this.resolveDriverRide(driverUserId, rideId);

    if (ride.status !== RideStatus.ACCEPTED) {
      throw new ForbiddenException(
        `Cannot mark en-route from status '${ride.status}' (expected: accepted)`,
      );
    }

    ride.status = RideStatus.DRIVING_TO_PICKUP;
    const saved = await this.rideRepo.save(ride);

    const clientUser = await this.getClientUser(ride.clientId);
    if (clientUser) {
      this.gatewayService.emitToUser(clientUser.id, 'driver_en_route', {
        rideId,
        driverName: `${driver.firstName} ${driver.lastName}`,
      });
      await this.notificationsService.sendToToken(clientUser.fcmToken, {
        title: 'Driver is on the way',
        body: `${driver.firstName} is heading to your pickup location.`,
        data: { rideId, event: 'driver_en_route' },
      });
    }

    this.logger.log(`Ride ${rideId} — driver ${driver.id} en route`);
    return this.toDto(saved);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 19: POST /rides/:id/arrived  (DRIVER only)
  // ─────────────────────────────────────────────────────────────────────────────
  async markArrived(driverUserId: string, rideId: string): Promise<RideResponseDto> {
    const { driver, ride } = await this.resolveDriverRide(driverUserId, rideId);

    if (
      ride.status !== RideStatus.ACCEPTED &&
      ride.status !== RideStatus.DRIVING_TO_PICKUP
    ) {
      throw new ForbiddenException(
        `Cannot mark arrived from status '${ride.status}'`,
      );
    }

    ride.pickupArrivedAt = new Date();
    const saved = await this.rideRepo.save(ride);

    const clientUser = await this.getClientUser(ride.clientId);
    if (clientUser) {
      this.gatewayService.emitToUser(clientUser.id, 'driver_arrived', {
        rideId,
        driverName: `${driver.firstName} ${driver.lastName}`,
        vehiclePlate: driver.vehiclePlate,
      });
      await this.notificationsService.sendToToken(clientUser.fcmToken, {
        title: 'Driver has arrived!',
        body: `${driver.firstName} is waiting for you at the pickup location.`,
        data: { rideId, event: 'driver_arrived' },
      });
    }

    this.logger.log(`Ride ${rideId} — driver ${driver.id} arrived at pickup`);
    return this.toDto(saved);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 19: POST /rides/:id/start  (DRIVER only)
  // ─────────────────────────────────────────────────────────────────────────────
  async startRide(driverUserId: string, rideId: string): Promise<RideResponseDto> {
    const { driver, ride } = await this.resolveDriverRide(driverUserId, rideId);

    const allowedStatuses: RideStatus[] = [
      RideStatus.ACCEPTED,
      RideStatus.DRIVING_TO_PICKUP,
    ];
    if (!allowedStatuses.includes(ride.status)) {
      throw new ForbiddenException(
        `Cannot start ride from status '${ride.status}'`,
      );
    }

    ride.status = RideStatus.IN_PROGRESS;
    ride.startedAt = new Date();
    const saved = await this.rideRepo.save(ride);

    // Begin route tracking — bind driver → ride in Redis
    void this.routeTracker.setActiveRide(driver.id, rideId);

    const clientUser = await this.getClientUser(ride.clientId);
    if (clientUser) {
      this.gatewayService.emitToUser(clientUser.id, 'ride_started', { rideId });
      await this.notificationsService.sendToToken(clientUser.fcmToken, {
        title: 'Your ride has started',
        body: 'Enjoy your trip!',
        data: { rideId, event: 'ride_started' },
      });
    }

    this.logger.log(`Ride ${rideId} started by driver ${driver.id}`);
    return this.toDto(saved);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 19: POST /rides/:id/complete  (DRIVER only)
  // ─────────────────────────────────────────────────────────────────────────────
  async completeRide(
    driverUserId: string,
    rideId: string,
    fareInput?: { distanceKm?: number; durationMinutes?: number; totalFare?: number },
  ): Promise<RideResponseDto> {
    const { driver, ride } = await this.resolveDriverRide(driverUserId, rideId);

    if (ride.status !== RideStatus.IN_PROGRESS) {
      throw new ForbiddenException(
        `Cannot complete ride from status '${ride.status}' (expected: in_progress)`,
      );
    }

    ride.status = RideStatus.COMPLETED;
    ride.completedAt = new Date();

    // ── Finalize route tracking ─────────────────────────────────────────────
    // Flush any buffered GPS waypoints to DB and compute actual GPS distance.
    const actualKm = await this.routeTracker.finalizeRoute(rideId);
    if (actualKm != null) {
      ride.actualDistanceKm = actualKm;
    }
    void this.routeTracker.clearActiveRide(driver.id);

    // ── Fare calculation ────────────────────────────────────────────────────

    // 1. Distance: prefer driver-supplied value; then actual GPS distance from
    //    waypoints; fall back to Haversine from stored coordinates.
    if (fareInput?.distanceKm != null) {
      ride.distanceKm = fareInput.distanceKm;
    } else if (ride.distanceKm == null && actualKm != null) {
      // Use actual GPS-tracked distance
      ride.distanceKm = actualKm;
    } else if (ride.distanceKm == null && ride.dropoffLat != null && ride.dropoffLng != null) {
      // Auto-calculate straight-line distance from stored coordinates
      ride.distanceKm = this.haversineKm(
        Number(ride.pickupLat), Number(ride.pickupLng),
        Number(ride.dropoffLat), Number(ride.dropoffLng),
      );
    }

    // 2. Duration: prefer driver-supplied; estimate from distance if missing
    if (fareInput?.durationMinutes != null) {
      ride.durationMinutes = fareInput.durationMinutes;
    } else if (ride.durationMinutes == null && ride.distanceKm != null) {
      // Rough estimate: 30 km/h average city speed
      ride.durationMinutes = Math.round((Number(ride.distanceKm) / 30) * 60 * 10) / 10;
    }

    // 3. Fare: tariff-based calculation when possible; always fall back to
    //    driver-supplied fare so we never leave totalFare null if the driver
    //    provided a value (e.g. tariff was deleted after the ride started).
    let fareCalculated = false;
    if (ride.tariffId && ride.distanceKm != null) {
      const tariff = await this.tariffRepo.findOne({ where: { id: ride.tariffId } });
      if (tariff) {
        const distKm   = Number(ride.distanceKm);
        const durMin   = Number(ride.durationMinutes ?? 0);
        const surge    = Math.max(1, Number(tariff.surgeMultiplier ?? 1));
        const base     = Number(tariff.baseFare);
        const distFare = Math.round(distKm * Number(tariff.perKmRate)     * 100) / 100;
        const timeFare = Math.round(durMin * Number(tariff.perMinuteRate) * 100) / 100;
        const raw      = base + distFare + timeFare;
        const afterMin = Math.max(raw, Number(tariff.minimumFare));
        const total    = afterMin * surge;

        ride.baseFare     = base;
        ride.distanceFare = distFare;
        ride.timeFare     = timeFare;
        ride.totalFare    = Math.round(total * 100) / 100;
        fareCalculated    = true;
      }
    }

    if (!fareCalculated && fareInput?.totalFare != null) {
      // Fallback: use the driver-supplied fare directly.
      // This covers: solo drivers without a tariff, AND the case where a
      // tariff was assigned but the lookup above returned null (deleted tariff).
      ride.totalFare = Math.round(fareInput.totalFare * 100) / 100;
    }

    // ── Apply promo code discount (if the ride was booked with one) ──────────
    if (ride.promoCode && ride.totalFare != null) {
      const promo = await this.promoRepo.findOne({
        where: { code: ride.promoCode, isActive: true },
      });
      if (promo) {
        const discount = this.computeDiscount(promo, Number(ride.totalFare));
        ride.discountAmount = discount;
        ride.totalFare      = Math.round((Number(ride.totalFare) - discount) * 100) / 100;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const saved = await this.rideRepo.save(ride);

    // Remove live-location relay, chat reverse, and ETA pickup-coords keys — ride is over
    const clientUserForCleanup = await this.getClientUser(ride.clientId);
    await this.redis.del(
      `driver:active_client:${driver.id}`,
      `driver:pickup_coords:${driver.id}`,
      ...(clientUserForCleanup ? [`client:active_driver_user:${clientUserForCleanup.id}`] : []),
    );

    // Increment totalRides on both driver and client (fire-and-forget)
    void this.driverRepo.increment({ id: driver.id }, 'totalRides', 1);
    void this.clientRepo.increment({ id: ride.clientId }, 'totalRides', 1);

    // Credit driver's wallet with their share of the fare (fire-and-forget)
    if (saved.totalFare != null && Number(saved.totalFare) > 0) {
      void this.walletService.creditRide(driver.id, rideId, Number(saved.totalFare));
    }

    const clientUser = clientUserForCleanup;
    if (clientUser) {
      this.gatewayService.emitToUser(clientUser.id, 'ride_completed', {
        rideId,
        completedAt: saved.completedAt,
      });
      await this.notificationsService.sendToToken(clientUser.fcmToken, {
        title: 'Ride completed',
        body: 'You have arrived! Please rate your driver.',
        data: { rideId, event: 'ride_completed' },
      });

      // ── Email receipt (fire-and-forget — never blocks the response) ──────────
      if (clientUser.email) {
        const clientProfile = await this.clientRepo.findOne({ where: { id: ride.clientId } });
        const clientName = clientProfile
          ? `${clientProfile.firstName ?? ''} ${clientProfile.lastName ?? ''}`.trim() || 'Valued Customer'
          : 'Valued Customer';
        const driverName = `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || 'Your Driver';

        void this.mailerService.sendRideReceipt({
          ride:        saved,
          clientName,
          clientEmail: clientUser.email,
          driverName,
        });
      }
    }

    this.logger.log(`Ride ${rideId} completed by driver ${driver.id}`);
    return this.toDto(saved);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 21: POST /rides/:id/pay-cash  (DRIVER only)
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Driver confirms that the client paid in cash.
   * The ride must be completed. Sets paymentStatus → paid.
   * Stripe / card payments will be wired up in a future step.
   */
  async confirmCashPayment(driverUserId: string, rideId: string): Promise<RideResponseDto> {
    const { driver, ride } = await this.resolveDriverRide(driverUserId, rideId);

    if (ride.status !== RideStatus.COMPLETED) {
      throw new ForbiddenException(
        `Cash payment can only be confirmed on a completed ride (current: ${ride.status})`,
      );
    }

    if (ride.paymentStatus === PaymentStatus.PAID) {
      throw new ForbiddenException('Payment is already marked as paid');
    }

    ride.paymentStatus = PaymentStatus.PAID;
    const saved = await this.rideRepo.save(ride);

    // Notify client
    const clientUser = await this.getClientUser(ride.clientId);
    if (clientUser) {
      this.gatewayService.emitToUser(clientUser.id, 'payment_confirmed', {
        rideId,
        paymentMethod: 'cash',
        paymentStatus: PaymentStatus.PAID,
      });
      await this.notificationsService.sendToToken(clientUser.fcmToken, {
        title: 'Payment confirmed',
        body: 'Cash payment received. Thank you for riding with us!',
        data: { rideId, event: 'payment_confirmed' },
      });
    }

    this.logger.log(`Ride ${rideId} — cash payment confirmed by driver ${driver.id}`);
    return this.toDto(saved);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 22: POST /rides/:id/rate  (CLIENT or DRIVER)
  // ─────────────────────────────────────────────────────────────────────────────
  async rateRide(
    userId: string,
    userRole: UserRole,
    rideId: string,
    dto: RateRideDto,
  ): Promise<RideResponseDto> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    if (ride.status !== RideStatus.COMPLETED) {
      throw new ForbiddenException('Ratings can only be submitted for completed rides');
    }

    if (userRole === UserRole.CLIENT) {
      // Resolve client
      const client = await this.clientRepo.findOne({ where: { userId } });
      if (!client) throw new NotFoundException('Client profile not found');
      if (ride.clientId !== client.id) {
        throw new ForbiddenException('This is not your ride');
      }
      if (ride.clientRating !== null) {
        throw new ForbiddenException('You have already rated this ride');
      }

      // Persist rating on ride
      ride.clientRating = dto.rating;
      ride.clientReview = dto.review ?? null;
      await this.rideRepo.save(ride);

      // Recalculate driver's average rating from all rated rides
      if (ride.driverId) {
        const avgRow = await this.rideRepo
          .createQueryBuilder('r')
          .select('AVG(r.client_rating)', 'avg')
          .where('r.driver_id = :driverId AND r.client_rating IS NOT NULL', {
            driverId: ride.driverId,
          })
          .getRawOne<{ avg: string | null }>();
        const avg = avgRow?.avg ?? null;
        const avgNum = avg !== null ? Math.round(parseFloat(avg) * 100) / 100 : null;
        if (avgNum !== null) {
          await this.driverRepo.update({ id: ride.driverId }, { rating: avgNum });
        }

        // Notify the driver
        const driver = await this.driverRepo.findOne({
          where: { id: ride.driverId },
          select: ['userId'],
        });
        if (driver) {
          this.gatewayService.emitToUser(driver.userId, 'ride_rated', {
            rideId,
            ratedBy: 'client',
            rating: dto.rating,
            newAvgRating: avgNum,
          });
        }
      }
    } else if (userRole === UserRole.DRIVER) {
      // Resolve driver
      const driver = await this.driverRepo.findOne({ where: { userId } });
      if (!driver) throw new NotFoundException('Driver profile not found');
      if (ride.driverId !== driver.id) {
        throw new ForbiddenException('You are not the driver for this ride');
      }
      if (ride.driverRating !== null) {
        throw new ForbiddenException('You have already rated this ride');
      }

      // Persist rating on ride
      ride.driverRating = dto.rating;
      ride.driverReview = dto.review ?? null;
      await this.rideRepo.save(ride);

      // Recalculate client's average rating
      const clientAvgRow = await this.rideRepo
        .createQueryBuilder('r')
        .select('AVG(r.driver_rating)', 'avg')
        .where('r.client_id = :clientId AND r.driver_rating IS NOT NULL', {
          clientId: ride.clientId,
        })
        .getRawOne<{ avg: string | null }>();
      const clientAvg = clientAvgRow?.avg ?? null;
      const clientAvgNum =
        clientAvg !== null ? Math.round(parseFloat(clientAvg) * 100) / 100 : null;
      if (clientAvgNum !== null) {
        await this.clientRepo.update({ id: ride.clientId }, { rating: clientAvgNum });
      }

      // Notify the client
      const clientUser = await this.getClientUser(ride.clientId);
      if (clientUser) {
        this.gatewayService.emitToUser(clientUser.id, 'ride_rated', {
          rideId,
          ratedBy: 'driver',
          rating: dto.rating,
        });
      }
    } else {
      throw new ForbiddenException('Only clients and drivers can submit ratings');
    }

    this.logger.log(
      `Ride ${rideId} rated ${dto.rating}★ by ${userRole} (userId: ${userId})`,
    );

    // Re-fetch to return the latest state
    const updated = await this.rideRepo.findOne({ where: { id: rideId } });
    return this.toDto(updated!);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Call the Google Maps Distance Matrix API to get real road distance and
   * driving duration between two points.
   *
   * Returns null when:
   *  • GOOGLE_MAPS_API_KEY is not set in the environment
   *  • The API returns a non-OK HTTP status or element status
   *  • The request times out or the network is unavailable
   *
   * The caller falls back to Haversine in all null cases.
   */
  private async getDistanceMatrixRoute(
    pickupLat:  number,
    pickupLng:  number,
    dropoffLat: number,
    dropoffLng: number,
  ): Promise<{ distanceKm: number; durationMinutes: number } | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
      url.searchParams.set('origins',      `${pickupLat},${pickupLng}`);
      url.searchParams.set('destinations', `${dropoffLat},${dropoffLng}`);
      url.searchParams.set('mode',         'driving');
      url.searchParams.set('key',          apiKey);

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(5_000),  // 5 s hard limit
      });
      if (!res.ok) return null;

      const json = await res.json() as {
        status: string;
        rows: Array<{
          elements: Array<{
            status:   string;
            distance: { value: number };   // metres
            duration: { value: number };   // seconds
          }>;
        }>;
      };

      if (json.status !== 'OK') return null;

      const element = json.rows?.[0]?.elements?.[0];
      if (!element || element.status !== 'OK') return null;

      return {
        distanceKm:     Math.round((element.distance.value / 1000) * 100) / 100,
        durationMinutes: Math.round((element.duration.value / 60)  * 10)  / 10,
      };
    } catch (err) {
      this.logger.warn(
        `Distance Matrix API unavailable — falling back to Haversine: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 100: GET /rides/:id/route  (CLIENT or DRIVER — must own the ride)
  // ─────────────────────────────────────────────────────────────────────────────
  async getRideRoute(
    userId: string,
    userRole: UserRole,
    rideId: string,
  ): Promise<Array<{ lat: number; lng: number; recordedAt: Date }>> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    // Ownership check
    if (userRole === UserRole.CLIENT) {
      const client = await this.clientRepo.findOne({ where: { userId } });
      if (!client || ride.clientId !== client.id) {
        throw new ForbiddenException('This is not your ride');
      }
    } else if (userRole === UserRole.DRIVER) {
      const driver = await this.driverRepo.findOne({ where: { userId } });
      if (!driver || ride.driverId !== driver.id) {
        throw new ForbiddenException('You are not the driver for this ride');
      }
    }

    return this.routeTracker.getRoute(rideId);
  }

  /** Haversine great-circle distance in kilometres between two lat/lng points */
  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000) / 1000;
  }

  // ── Step 68: Night-tariff helpers ─────────────────────────────────────────

  /**
   * Returns true when `hour` (0–23 UTC) falls inside the night window defined
   * by [startHour, endHour).  Handles windows that wrap past midnight,
   * e.g. start=22 end=6  →  22, 23, 0, 1, 2, 3, 4, 5 are all "night".
   */
  private isInNightWindow(hour: number, startHour: number, endHour: number): boolean {
    if (startHour < endHour) {
      // Window stays within the same day, e.g. 20:00–23:00
      return hour >= startHour && hour < endHour;
    }
    // Window wraps past midnight, e.g. 22:00–06:00
    return hour >= startHour || hour < endHour;
  }

  /**
   * Select the best active tariff for a company (or platform-wide when
   * `companyId` is null) at the given point in time.
   *
   * Priority:
   *  1. Night tariff whose window covers `atTime` (UTC hour)
   *  2. First non-night (day) tariff
   *  3. Any active tariff as last resort (e.g. only a night tariff exists but
   *     it is currently outside its window — better than no tariff at all)
   */
  private async selectActiveTariff(
    companyId: string | null,
    atTime: Date = new Date(),
    vehicleType?: VehicleType | null,
  ): Promise<Tariff | null> {
    const tariffs = await this.tariffRepo.find({
      where: companyId ? { companyId, isActive: true } : { companyId: IsNull(), isActive: true },
      order: { createdAt: 'ASC' },
    });

    if (tariffs.length === 0) return null;

    // Prefer type-specific tariffs; fall back to generic (vehicleType IS NULL)
    const typed   = vehicleType ? tariffs.filter(t => t.vehicleType === vehicleType) : [];
    const generic = tariffs.filter(t => t.vehicleType == null);
    const pool    = typed.length > 0 ? typed : generic;
    const candidates = pool.length > 0 ? pool : tariffs; // last-resort: any tariff

    const utcHour = atTime.getUTCHours();

    // 1. Night tariff whose window matches right now
    const matchingNight = candidates.find(
      t =>
        t.isNightTariff &&
        t.nightStartHour != null &&
        t.nightEndHour   != null &&
        this.isInNightWindow(utcHour, t.nightStartHour, t.nightEndHour),
    );
    if (matchingNight) return matchingNight;

    // 2. First regular (day) tariff
    const dayTariff = candidates.find(t => !t.isNightTariff);
    if (dayTariff) return dayTariff;

    // 3. Fallback — return first tariff regardless (night tariff outside window)
    return candidates[0];
  }

  /**
   * Build a ranked list of candidate drivers, sorted by composite dispatch
   * score rather than raw distance alone.
   *
   * Score formula (all components normalised to [0, 1]):
   *   score = W_DIST   * distScore        (proximity — closest = 1.0)
   *         + W_RATING * ratingScore      (driver rating / 5)
   *         + W_ACCEPT * acceptanceScore  (historical accept rate)
   *         + W_EXP    * expScore         (rides completed, capped at 100)
   *
   * Weights are configurable via env vars (see top of file).
   * Drivers with no accept/decline history receive a neutral acceptanceScore
   * of DISPATCH_NEW_DRIVER_ACCEPT_SCORE to avoid unfairly penalising them.
   *
   * @param exclude  Driver IDs that have already declined — skip them entirely.
   */
  private async buildCandidateList(
    lat: number,
    lng: number,
    radiusKm: number,
    exclude: string[],
    vehicleType?: VehicleType | null,
  ): Promise<Array<{ driverId: string; userId: string; lat: number; lng: number; dispatchScore: number }>> {
    const geoResults = await this.gpsService.findNearestDrivers(lat, lng, radiusKm, MAX_CANDIDATES);
    if (geoResults.length === 0) return [];

    // ── 1. Filter declined / excluded drivers ─────────────────────────────────
    const excludeSet  = new Set(exclude);
    const eligibleGeo = geoResults.filter((r) => !excludeSet.has(r.driverId));
    const eligibleIds = eligibleGeo.map((r) => r.driverId);
    if (eligibleIds.length === 0) return [];

    // ── 2. Load DB fields needed for scoring ──────────────────────────────────
    const whereClause: FindOptionsWhere<Driver> = { id: In(eligibleIds), isApproved: true };
    if (vehicleType) whereClause.vehicleType = vehicleType;

    const drivers = await this.driverRepo.find({
      where:  whereClause,
      select: ['id', 'userId', 'rating', 'totalRides', 'totalAccepted', 'totalDeclined'],
    });
    if (drivers.length === 0) return [];

    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    // ── 3. Merge geo data with DB data ────────────────────────────────────────
    const candidates = eligibleGeo
      .filter((r) => driverMap.has(r.driverId))
      .map((r)    => ({ geo: r, driver: driverMap.get(r.driverId)! }));

    if (candidates.length === 0) return [];

    // ── 4. Compute composite dispatch score ───────────────────────────────────
    const maxDist = Math.max(...candidates.map((c) => c.geo.distanceKm), 0.001);

    const scored = candidates.map((c) => {
      const { geo, driver } = c;

      const distScore = 1.0 - geo.distanceKm / (maxDist + 0.001);
      const ratingScore = Math.min(Number(driver.rating), 5) / 5.0;
      const offered = driver.totalAccepted + driver.totalDeclined;
      const acceptanceScore =
        offered > 0
          ? driver.totalAccepted / offered
          : DISPATCH_NEW_DRIVER_ACCEPT_SCORE;
      const expScore = Math.min(driver.totalRides, 100) / 100;

      const dispatchScore =
        DISPATCH_W_DISTANCE   * distScore +
        DISPATCH_W_RATING     * ratingScore +
        DISPATCH_W_ACCEPTANCE * acceptanceScore +
        DISPATCH_W_EXPERIENCE * expScore;

      this.logger.debug(
        `Dispatch score for driver ${driver.id}: ` +
        `dist=${distScore.toFixed(3)} rating=${ratingScore.toFixed(3)} ` +
        `accept=${acceptanceScore.toFixed(3)} exp=${expScore.toFixed(3)} ` +
        `=> ${dispatchScore.toFixed(4)}`,
      );

      return {
        driverId:      driver.id,
        userId:        driver.userId,
        lat:           geo.lat,
        lng:           geo.lng,
        dispatchScore,
      };
    });

    // ── 5. Sort best score first ───────────────────────────────────────────────
    scored.sort((a, b) => b.dispatchScore - a.dispatchScore);

    return scored;
  }

  /**
   * Notify a specific driver of a new ride request via WebSocket and FCM,
   * then store them as the pending driver for this ride.
   */
  private async dispatchToDriver(
    ride: Ride,
    candidate: { driverId: string; userId: string; lat: number; lng: number },
    radiusKm: number,
  ): Promise<void> {
    const pendingKey = `ride:${ride.id}:pending`;
    await this.redis.set(pendingKey, candidate.driverId, 'EX', PENDING_TTL_SECONDS);

    // Include any passenger stops in the dispatch payload
    const dispatchStops = await this.rideStopRepo.find({
      where: { rideId: ride.id },
      order: { sortOrder: 'ASC' },
    });

    const ridePayload = {
      rideId: ride.id,
      pickupLat: Number(ride.pickupLat),
      pickupLng: Number(ride.pickupLng),
      pickupAddress: ride.pickupAddress,
      dropoffLat: ride.dropoffLat !== null ? Number(ride.dropoffLat) : null,
      dropoffLng: ride.dropoffLng !== null ? Number(ride.dropoffLng) : null,
      dropoffAddress: ride.dropoffAddress,
      stops: dispatchStops.map(s => ({
        id:        s.id,
        sortOrder: s.sortOrder,
        lat:       Number(s.lat),
        lng:       Number(s.lng),
        address:   s.address,
        reachedAt: s.reachedAt,
      })),
    };

    // WebSocket — driver must be in room user:{driverUserId}
    this.gatewayService.emitToUser(candidate.userId, 'ride_request', ridePayload);

    // FCM push
    const driverUser = await this.userRepo.findOne({
      where: { id: candidate.userId },
      select: ['fcmToken'],
    });
    await this.notificationsService.sendToToken(driverUser?.fcmToken, {
      title: 'New ride request',
      body: `Pickup: ${ride.pickupAddress ?? `${Number(ride.pickupLat).toFixed(4)}, ${Number(ride.pickupLng).toFixed(4)}`}`,
      data: { rideId: ride.id, event: 'ride_request' },
    });

    this.logger.debug(`Ride ${ride.id} dispatched to driver ${candidate.driverId}`);
  }

  /**
   * Return the User record for a given Client (identified by clients.id).
   * Used to send WebSocket / FCM messages to the client.
   */
  private async getClientUser(clientId: string): Promise<User | null> {
    const client = await this.clientRepo.findOne({
      where: { id: clientId },
      select: ['userId'],
    });
    if (!client) return null;

    return this.userRepo.findOne({
      where: { id: client.userId },
      select: ['id', 'fcmToken'],
    });
  }

  /**
   * Load and validate both the driver (by userId) and the ride (by id),
   * ensuring the ride's driverId matches this driver.
   * Used by all Step 19 lifecycle endpoints.
   */
  private async resolveDriverRide(
    driverUserId: string,
    rideId: string,
  ): Promise<{ driver: Driver; ride: Ride }> {
    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    // Ensure this driver owns the ride
    if (ride.driverId !== driver.id) {
      throw new ForbiddenException('You are not the driver for this ride');
    }

    return { driver, ride };
  }

  // ── GET /rides/history ────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // Step 58: GET /rides/active  — resume an in-progress ride after app restart
  // ─────────────────────────────────────────────────────────────────────────────
  async getActiveRide(userId: string, role: UserRole): Promise<RideResponseDto | null> {
    // Only statuses that require the user to be on the active ride screen.
    // We intentionally exclude REQUESTED+scheduled rides (scheduledAt IS NOT NULL + no driver)
    // because they sit in the background — no active screen needed until dispatched.
    const activeStatuses = [
      RideStatus.ACCEPTED,
      RideStatus.DRIVING_TO_PICKUP,
      RideStatus.IN_PROGRESS,
    ];

    if (role === UserRole.CLIENT) {
      const client = await this.clientRepo.findOne({ where: { userId }, select: ['id'] });
      if (!client) return null;

      // Also include REQUESTED rides that are immediate (scheduledAt IS NULL)
      const ride = await this.rideRepo
        .createQueryBuilder('ride')
        .where('ride.clientId = :clientId', { clientId: client.id })
        .andWhere(
          '(ride.status IN (:...activeStatuses) OR (ride.status = :requested AND ride.scheduledAt IS NULL))',
          { activeStatuses, requested: RideStatus.REQUESTED },
        )
        .orderBy('ride.createdAt', 'DESC')
        .getOne();

      if (!ride) return null;
      await this.attachStops([ride]);
      return this.toDto(ride);
    }

    if (role === UserRole.DRIVER) {
      const driver = await this.driverRepo.findOne({ where: { userId }, select: ['id'] });
      if (!driver) return null;
      const ride = await this.rideRepo.findOne({
        where: { driverId: driver.id, status: In(activeStatuses) },
        order: { createdAt: 'DESC' },
      });
      if (!ride) return null;
      await this.attachStops([ride]);
      return this.toDto(ride);
    }

    return null;
  }

  async getRideHistory(
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<RideResponseDto[]> {
    let clientId: string | undefined;
    let driverId: string | undefined;

    if (role === UserRole.CLIENT) {
      const client = await this.clientRepo.findOne({ where: { userId }, select: ['id'] });
      if (!client) return [];
      clientId = client.id;
    } else {
      const driver = await this.driverRepo.findOne({ where: { userId }, select: ['id'] });
      if (!driver) return [];
      driverId = driver.id;
    }

    const where = clientId ? { clientId } : { driverId };
    const rides = await this.rideRepo.find({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.attachStops(rides);
    return rides.map((r) => this.toDto(r));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Driver earnings — GET /rides/earnings?period=today|week|month|all
  // ─────────────────────────────────────────────────────────────────────────────
  async getDriverEarnings(driverUserId: string, period: string) {
    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) return { totalFare: 0, driverShare: 0, commissionPct: 100, rides: 0 };

    const since = periodStart(period);

    const qb = this.rideRepo
      .createQueryBuilder('r')
      .where('r.driverId = :driverId', { driverId: driver.id })
      .andWhere('r.status = :status',  { status: RideStatus.COMPLETED })
      .andWhere('r.totalFare IS NOT NULL');

    if (since) qb.andWhere('r.completedAt >= :since', { since });

    // getMany() returns typed entity objects — no raw-column alias guesswork
    const rides = await qb.select('r').getMany();

    // Find the commission rate from the driver's company (if any)
    let commissionPct = 100; // solo driver — keeps everything
    if (driver.companyId) {
      const company = await this.companyRepo.findOne({ where: { id: driver.companyId } });
      if (company) commissionPct = Number(company.driverCommissionPct);
    }

    const totalFare = rides.reduce((s, r) => s + Number(r.totalFare ?? 0), 0);
    const driverShare = Math.round(totalFare * commissionPct) / 100;

    return {
      period,
      rides:         rides.length,
      totalFare:     Math.round(totalFare * 100) / 100,
      commissionPct,
      driverShare:   Math.round(driverShare * 100) / 100,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 74: GET /rides/ratings  — driver rating breakdown
  // ─────────────────────────────────────────────────────────────────────────────
  async getDriverRatings(driverUserId: string): Promise<{
    average:   number | null;
    total:     number;
    breakdown: Record<string, number>;   // '1'–'5' → count
    recent:    Array<{
      rating:        number;
      review:        string | null;
      pickupAddress: string | null;
      completedAt:   Date | null;
    }>;
  }> {
    const empty = {
      average:   null,
      total:     0,
      breakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      recent:    [] as Array<{ rating: number; review: string | null; pickupAddress: string | null; completedAt: Date | null }>,
    };

    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) return empty;

    // Fetch all completed rides for this driver (select only needed columns)
    const allRides = await this.rideRepo.find({
      where:  { driverId: driver.id, status: RideStatus.COMPLETED },
      select: ['clientRating', 'clientReview', 'pickupAddress', 'completedAt'],
      order:  { completedAt: 'DESC' },
    });

    const rated = allRides.filter(r => r.clientRating !== null);
    const total = rated.length;
    if (total === 0) return empty;

    // Build per-star breakdown + running sum
    const breakdown: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let sum = 0;
    for (const r of rated) {
      const star = String(r.clientRating!);
      breakdown[star] = (breakdown[star] ?? 0) + 1;
      sum += Number(r.clientRating!);
    }

    const average = Math.round((sum / total) * 100) / 100;

    // Return up to 10 most-recent reviews
    const recent = rated.slice(0, 10).map(r => ({
      rating:        Number(r.clientRating),
      review:        r.clientReview,
      pickupAddress: r.pickupAddress,
      completedAt:   r.completedAt,
    }));

    return { average, total, breakdown, recent };
  }

  /** Map a Ride entity to the public DTO */
  private toDto(ride: Ride, stops?: RideStop[]): RideResponseDto {
    // Prefer explicitly-passed stops; fall back to attached property; then empty array
    const rideStops: RideStop[] = stops ?? (ride as any).__stops ?? [];
    const stopDtos: RideStopResponseDto[] = rideStops
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(s => ({
        id:        s.id,
        sortOrder: s.sortOrder,
        lat:       Number(s.lat),
        lng:       Number(s.lng),
        address:   s.address,
        reachedAt: s.reachedAt,
      }));

    return {
      id: ride.id,
      status: ride.status,
      clientId: ride.clientId,
      driverId: ride.driverId,
      companyId: ride.companyId,
      tariffId: ride.tariffId ?? null,
      pickupLat: Number(ride.pickupLat),
      pickupLng: Number(ride.pickupLng),
      pickupAddress: ride.pickupAddress,
      dropoffLat: ride.dropoffLat !== null ? Number(ride.dropoffLat) : null,
      dropoffLng: ride.dropoffLng !== null ? Number(ride.dropoffLng) : null,
      dropoffAddress: ride.dropoffAddress,
      createdAt: ride.createdAt,
      acceptedAt: ride.acceptedAt,
      pickupArrivedAt: ride.pickupArrivedAt,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      cancelledAt: ride.cancelledAt,
      cancelledBy: ride.cancelledBy,
      cancelReason: ride.cancelReason,
      paymentStatus: ride.paymentStatus,
      // Trip metrics — TypeORM returns DECIMAL as string; convert explicitly
      distanceKm:     ride.distanceKm     != null ? Number(ride.distanceKm)     : null,
      durationMinutes: ride.durationMinutes != null ? Number(ride.durationMinutes) : null,
      // Fare breakdown
      baseFare:     ride.baseFare     != null ? Number(ride.baseFare)     : null,
      distanceFare: ride.distanceFare != null ? Number(ride.distanceFare) : null,
      timeFare:     ride.timeFare     != null ? Number(ride.timeFare)     : null,
      totalFare:    ride.totalFare    != null ? Number(ride.totalFare)    : null,
      // Ratings
      clientRating: ride.clientRating != null ? Number(ride.clientRating) : null,
      clientReview: ride.clientReview,
      driverRating: ride.driverRating != null ? Number(ride.driverRating) : null,
      driverReview: ride.driverReview,
      // Scheduled ride
      scheduledAt: ride.scheduledAt ?? null,
      // Promo code
      promoCode:      ride.promoCode      ?? null,
      discountAmount: ride.discountAmount != null ? Number(ride.discountAmount) : null,
      // Cancellation fee
      cancellationFee: ride.cancellationFee != null ? Number(ride.cancellationFee) : null,
      // No-show
      noShowReportedBy: ride.noShowReportedBy ?? null,
      // Intermediate stops
      stops: stopDtos,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: load stops for multiple rides at once
  // ─────────────────────────────────────────────────────────────────────────────
  private async attachStops(rides: Ride[]): Promise<void> {
    if (rides.length === 0) return;
    const ids = rides.map(r => r.id);
    const stops = await this.rideStopRepo.find({
      where: { rideId: In(ids) },
      order: { sortOrder: 'ASC' },
    });
    const byRide = new Map<string, RideStop[]>();
    for (const s of stops) {
      const arr = byRide.get(s.rideId) ?? [];
      arr.push(s);
      byRide.set(s.rideId, arr);
    }
    for (const r of rides) {
      (r as any).__stops = byRide.get(r.id) ?? [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DRIVER: Mark intermediate stop as reached
  // POST /rides/:id/stops/:stopId/reached
  // ─────────────────────────────────────────────────────────────────────────────
  async markStopReached(driverUserId: string, rideId: string, stopId: string): Promise<RideStopResponseDto> {
    // Verify driver owns this ride
    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.driverId !== driver.id) throw new ForbiddenException('Not your ride');
    if (ride.status !== RideStatus.IN_PROGRESS) {
      throw new BadRequestException('Ride must be in progress to mark a stop');
    }

    const stop = await this.rideStopRepo.findOne({ where: { id: stopId, rideId } });
    if (!stop) throw new NotFoundException('Stop not found');
    if (stop.reachedAt) throw new BadRequestException('Stop already marked as reached');

    stop.reachedAt = new Date();
    const saved = await this.rideStopRepo.save(stop);

    // Notify client via WS (need userId, not clientId)
    const clientRec = await this.clientRepo.findOne({
      where: { id: ride.clientId },
      select: ['userId'],
    });
    if (clientRec) {
      this.gatewayService.emitToUser(clientRec.userId, 'stop_reached', {
        rideId,
        stopId:    saved.id,
        sortOrder: saved.sortOrder,
        reachedAt: saved.reachedAt,
      });
    }

    return {
      id:        saved.id,
      sortOrder: saved.sortOrder,
      lat:       Number(saved.lat),
      lng:       Number(saved.lng),
      address:   saved.address,
      reachedAt: saved.reachedAt,
    };
  }
}

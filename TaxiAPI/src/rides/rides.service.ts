import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { Client, Driver, Ride, User } from '../entities/index.js';
import { PaymentStatus, RideStatus, UserRole } from '../common/enums/index.js';
import { GpsService } from '../gps/gps.service.js';
import { GatewayService } from '../gateway/gateway.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NearestDriverDto } from './dto/nearest-driver.dto.js';
import { RequestRideDto } from './dto/request-ride.dto.js';
import { RideResponseDto } from './dto/ride-response.dto.js';
import { CancelRideDto } from './dto/cancel-ride.dto.js';
import { RateRideDto } from './dto/rate-ride.dto.js';

/** Seconds a driver has to respond before their pending slot expires */
const PENDING_TTL_SECONDS = 60;

/** Max candidates fetched per geo search when dispatching */
const MAX_CANDIDATES = 20;

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,

    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,

    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,

    private readonly gpsService: GpsService,
    private readonly gatewayService: GatewayService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 17: GET /rides/nearest-drivers
  // ─────────────────────────────────────────────────────────────────────────────
  async findNearestDrivers(
    lat: number,
    lng: number,
    radiusKm: number,
    limit: number,
  ): Promise<NearestDriverDto[]> {
    const geoResults = await this.gpsService.findNearestDrivers(lat, lng, radiusKm, limit);
    if (geoResults.length === 0) return [];

    const driverIds = geoResults.map((r) => r.driverId);
    const drivers = await this.driverRepo.find({
      where: { id: In(driverIds), isApproved: true },
      select: [
        'id', 'firstName', 'lastName',
        'vehicleMake', 'vehicleModel', 'vehicleYear',
        'vehiclePlate', 'vehicleColor', 'rating',
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
        rating: Number(d.rating),
      });
    }

    this.logger.debug(
      `Nearest drivers: found ${results.length} within ${radiusKm} km of (${lat},${lng})`,
    );
    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 18: POST /rides/request  (CLIENT only)
  // ─────────────────────────────────────────────────────────────────────────────
  async requestRide(clientUserId: string, dto: RequestRideDto): Promise<RideResponseDto> {
    // 1. Resolve client record
    const client = await this.clientRepo.findOne({ where: { userId: clientUserId } });
    if (!client) throw new NotFoundException('Client profile not found');

    const radiusKm = dto.radiusKm ?? 5;

    // 2. Find nearest online, approved drivers (live Redis geo)
    const candidates = await this.buildCandidateList(
      dto.pickupLat,
      dto.pickupLng,
      radiusKm,
      [],
    );

    if (candidates.length === 0) {
      throw new NotFoundException('No drivers available in your area');
    }

    // 3. Create ride record with REQUESTED status
    const ride = this.rideRepo.create({
      clientId: client.id,
      status: RideStatus.REQUESTED,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      pickupAddress: dto.pickupAddress ?? null,
      dropoffLat: dto.dropoffLat ?? null,
      dropoffLng: dto.dropoffLng ?? null,
      dropoffAddress: dto.dropoffAddress ?? null,
    });
    const savedRide = await this.rideRepo.save(ride);

    // 4. Dispatch to first candidate
    await this.dispatchToDriver(savedRide, candidates[0], radiusKm);

    this.logger.log(`Ride ${savedRide.id} requested by client ${client.id}`);
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
    ride.driverId = driver.id;
    ride.companyId = driver.companyId;
    ride.status = RideStatus.ACCEPTED;
    ride.acceptedAt = new Date();
    const updatedRide = await this.rideRepo.save(ride);

    // Clean up Redis keys
    await this.redis.del(
      pendingKey,
      `ride:${rideId}:declined`,
    );

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
    }

    this.logger.log(`Ride ${rideId} accepted by driver ${driver.id}`);
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

    // Mark as declined in Redis
    const declinedKey = `ride:${rideId}:declined`;
    await this.redis.sadd(declinedKey, driver.id);
    await this.redis.del(pendingKey);

    // Retrieve all already-declined driver IDs
    const declinedIds = await this.redis.smembers(declinedKey);

    // Find next available driver (excluding all who declined)
    const radiusKm = 5; // use default radius for re-dispatch
    const candidates = await this.buildCandidateList(
      ride.pickupLat,
      ride.pickupLng,
      radiusKm,
      declinedIds,
    );

    if (candidates.length === 0) {
      // No drivers left — cancel the ride
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

    // ── Persist cancellation ──────────────────────────────────────────────────
    ride.status = RideStatus.CANCELLED;
    ride.cancelledAt = new Date();
    ride.cancelledBy = userRole;
    ride.cancelReason = dto.reason ?? null;
    const saved = await this.rideRepo.save(ride);

    // Clean up any pending/declined Redis keys (ride may have been in request phase)
    await this.redis.del(`ride:${rideId}:pending`, `ride:${rideId}:declined`);

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
  async completeRide(driverUserId: string, rideId: string): Promise<RideResponseDto> {
    const { driver, ride } = await this.resolveDriverRide(driverUserId, rideId);

    if (ride.status !== RideStatus.IN_PROGRESS) {
      throw new ForbiddenException(
        `Cannot complete ride from status '${ride.status}' (expected: in_progress)`,
      );
    }

    ride.status = RideStatus.COMPLETED;
    ride.completedAt = new Date();
    const saved = await this.rideRepo.save(ride);

    // Increment totalRides on both driver and client (fire-and-forget)
    void this.driverRepo.increment({ id: driver.id }, 'totalRides', 1);
    void this.clientRepo.increment({ id: ride.clientId }, 'totalRides', 1);

    const clientUser = await this.getClientUser(ride.clientId);
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
   * Build a list of candidate drivers sorted by distance, excluding any
   * driverIds in the `exclude` list (already declined).
   */
  private async buildCandidateList(
    lat: number,
    lng: number,
    radiusKm: number,
    exclude: string[],
  ): Promise<Array<{ driverId: string; userId: string; lat: number; lng: number }>> {
    const geoResults = await this.gpsService.findNearestDrivers(lat, lng, radiusKm, MAX_CANDIDATES);
    if (geoResults.length === 0) return [];

    // Filter out declined drivers
    const excludeSet = new Set(exclude);
    const eligibleIds = geoResults
      .filter((r) => !excludeSet.has(r.driverId))
      .map((r) => r.driverId);

    if (eligibleIds.length === 0) return [];

    // Load DB records for approved drivers + their userId
    const drivers = await this.driverRepo.find({
      where: { id: In(eligibleIds), isApproved: true },
      select: ['id', 'userId'],
    });

    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    // Re-order by original geo distance and return only those found in DB
    return geoResults
      .filter((r) => !excludeSet.has(r.driverId) && driverMap.has(r.driverId))
      .map((r) => ({
        driverId: r.driverId,
        userId: driverMap.get(r.driverId)!.userId,
        lat: r.lat,
        lng: r.lng,
      }));
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

    const ridePayload = {
      rideId: ride.id,
      pickupLat: Number(ride.pickupLat),
      pickupLng: Number(ride.pickupLng),
      pickupAddress: ride.pickupAddress,
      dropoffLat: ride.dropoffLat !== null ? Number(ride.dropoffLat) : null,
      dropoffLng: ride.dropoffLng !== null ? Number(ride.dropoffLng) : null,
      dropoffAddress: ride.dropoffAddress,
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

    return rides.map((r) => this.toDto(r));
  }

  /** Map a Ride entity to the public DTO */
  private toDto(ride: Ride): RideResponseDto {
    return {
      id: ride.id,
      status: ride.status,
      clientId: ride.clientId,
      driverId: ride.driverId,
      companyId: ride.companyId,
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
      clientRating: ride.clientRating,
      clientReview: ride.clientReview,
      driverRating: ride.driverRating,
      driverReview: ride.driverReview,
    };
  }
}

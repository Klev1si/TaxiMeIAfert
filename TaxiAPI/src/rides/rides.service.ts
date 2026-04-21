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
import { RideStatus } from '../common/enums/index.js';
import { GpsService } from '../gps/gps.service.js';
import { GatewayService } from '../gateway/gateway.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NearestDriverDto } from './dto/nearest-driver.dto.js';
import { RequestRideDto } from './dto/request-ride.dto.js';
import { RideResponseDto } from './dto/ride-response.dto.js';

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
    };
  }
}

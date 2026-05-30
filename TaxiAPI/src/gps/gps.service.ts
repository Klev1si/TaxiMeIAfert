import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { Driver } from '../entities/index.js';
import { FraudService } from '../fraud/fraud.service.js';
import { RouteTrackerService } from '../rides/route-tracker.service.js';

/** Sorted-set key used for GEOSEARCH in Step 17 */
export const DRIVERS_GEO_KEY = 'drivers:geo';

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  ts: number; // unix ms
}

@Injectable()
export class GpsService {
  private readonly logger = new Logger(GpsService.name);

  /**
   * Throttle PostgreSQL writes to at most once per 30 s per driver.
   * Redis is always updated immediately (it is the source of truth for live GPS).
   */
  private readonly DB_WRITE_INTERVAL_MS = 30_000;
  private readonly lastDbWrite = new Map<string, number>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    private readonly fraudService:     FraudService,
    private readonly routeTracker:     RouteTrackerService,
  ) {}

  // ── Called by EventsGateway on gps_update ─────────────────────────────────
  async updateLocation(
    driverId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    // 0a. Fraud: GPS spoof / teleport detection (fire-and-forget)
    void this.fraudService.detectGpsSpoof(driverId, lat, lng);

    // 0b. Route tracking: record waypoint if driver has an active ride (fire-and-forget)
    void this.routeTracker.getActiveRideId(driverId).then(rideId => {
      if (rideId) void this.routeTracker.recordWaypoint(rideId, lat, lng);
    });

    // 1. Geospatial index — powers GEOSEARCH (Step 17)
    //    GEOADD key longitude latitude member
    await this.redis.geoadd(DRIVERS_GEO_KEY, lng, lat, driverId);

    // 2. Hash for fast single-driver lookup without GEOPOS round-trip.
    //    EX = 90 s TTL: if the driver doesn't send another GPS within
    //    90 s (app closed, lost connection, battery saver killed the
    //    process), the hash auto-expires and they are filtered out of
    //    dispatch by `findNearestDrivers` below.
    //    Pipelined so HSET + EXPIRE is a single Redis round-trip.
    const key = `driver:loc:${driverId}`;
    await this.redis
      .multi()
      .hset(key, { lat: String(lat), lng: String(lng), ts: String(Date.now()) })
      .expire(key, 90)
      .exec();

    // 3. Throttled PostgreSQL update
    const now = Date.now();
    const last = this.lastDbWrite.get(driverId) ?? 0;
    if (now - last >= this.DB_WRITE_INTERVAL_MS) {
      this.lastDbWrite.set(driverId, now);
      await this.driverRepo.update(
        { id: driverId },
        { currentLat: lat, currentLng: lng, lastLocationAt: new Date() },
      );
      this.logger.debug(`DB updated for driver ${driverId}`);
    }
  }

  // ── Called when driver goes online (before first GPS fix) ────────────────
  async setOnlineStatus(driverId: string, isOnline: boolean): Promise<void> {
    await this.driverRepo.update({ id: driverId }, { isOnline });
    this.logger.log(`Driver ${driverId} isOnline → ${isOnline}`);
  }

  // ── Called when driver goes offline / disconnects ─────────────────────────
  async removeFromGeo(driverId: string): Promise<void> {
    await this.redis.zrem(DRIVERS_GEO_KEY, driverId);
    await this.redis.del(`driver:loc:${driverId}`);
    this.lastDbWrite.delete(driverId);
    // Clear the persistent online flag in the DB
    await this.driverRepo.update({ id: driverId }, { isOnline: false });
    // Clear fraud GPS snapshot so next online session starts fresh
    void this.fraudService.clearGpsSnapshot(driverId);
    this.logger.log(`Driver ${driverId} removed from geo index`);
  }

  // ── Fetch current location (used by Step 17 + rides) ─────────────────────
  async getLocation(driverId: string): Promise<DriverLocation | null> {
    const raw = await this.redis.hgetall(`driver:loc:${driverId}`);
    if (!raw.lat) return null;
    return {
      driverId,
      lat: parseFloat(raw.lat),
      lng: parseFloat(raw.lng),
      ts: parseInt(raw.ts, 10),
    };
  }

  // ── GEOSEARCH — find online drivers within radius ─────────────────────────
  async findNearestDrivers(
    lat: number,
    lng: number,
    radiusKm: number,
    limit: number,
  ): Promise<Array<{ driverId: string; distanceKm: number; lat: number; lng: number }>> {
    /**
     * GEOSEARCH drivers:geo FROMLONLAT <lng> <lat>
     *   BYRADIUS <radius> km ASC COUNT <limit>
     *   WITHDIST WITHCOORD
     *
     * Returns: [ [member, distStr, [lngStr, latStr]], ... ]
     */
    const raw = (await this.redis.call(
      'GEOSEARCH',
      DRIVERS_GEO_KEY,
      'FROMLONLAT',
      String(lng),
      String(lat),
      'BYRADIUS',
      String(radiusKm),
      'km',
      'ASC',
      'COUNT',
      String(limit),
      'WITHDIST',
      'WITHCOORD',
    )) as Array<[string, string, [string, string]]>;

    if (raw.length === 0) return [];

    // Filter out drivers whose live `driver:loc:*` hash has expired (>90 s
    // since their last GPS). The GEOADD entry doesn't expire on its own, so
    // without this filter we would still dispatch to drivers who closed the
    // app or lost connection minutes ago. We also opportunistically remove
    // stale entries from the GEO index so they stop matching at all.
    const driverIds = raw.map(([id]) => id);
    const pipeline = this.redis.pipeline();
    driverIds.forEach(id => pipeline.exists(`driver:loc:${id}`));
    const existsResults = (await pipeline.exec()) ?? [];

    const fresh: Array<{ driverId: string; distanceKm: number; lat: number; lng: number }> = [];
    const staleIds: string[] = [];
    raw.forEach(([driverId, distStr, [dLngStr, dLatStr]], idx) => {
      const r = existsResults[idx];
      const hashExists = r && !r[0] && r[1] === 1;
      if (hashExists) {
        fresh.push({
          driverId,
          distanceKm: parseFloat(parseFloat(distStr).toFixed(3)),
          lat: parseFloat(dLatStr),
          lng: parseFloat(dLngStr),
        });
      } else {
        staleIds.push(driverId);
      }
    });

    if (staleIds.length > 0) {
      // Clean up GEO entries for drivers whose location TTL expired — fire and
      // forget. They will re-add themselves when they next send GPS while
      // genuinely online.
      void this.redis.zrem(DRIVERS_GEO_KEY, ...staleIds).catch(() => {});
      // Mark them as offline in the DB so admin dashboards reflect reality.
      // The `isOnline = true` predicate avoids writing rows that are already
      // offline — Postgres skips them entirely, no row version churn.
      void this.driverRepo
        .createQueryBuilder()
        .update()
        .set({ isOnline: false })
        .whereInIds(staleIds)
        .andWhere('is_online = true')
        .execute()
        .catch(() => {});
      this.logger.debug(`Pruned ${staleIds.length} stale driver(s) from GEO: ${staleIds.join(', ')}`);
    }
    return fresh;
  }

  // ── All currently online drivers (for admin live-monitor) ────────────────
  async getAllOnlineDriverLocations(): Promise<DriverLocation[]> {
    // ZRANGE returns every member stored in the geo sorted-set
    const driverIds: string[] = await this.redis.zrange(DRIVERS_GEO_KEY, 0, -1);
    if (driverIds.length === 0) return [];

    const locations: DriverLocation[] = [];
    for (const driverId of driverIds) {
      const raw = await this.redis.hgetall(`driver:loc:${driverId}`);
      if (raw.lat) {
        locations.push({
          driverId,
          lat: parseFloat(raw.lat),
          lng: parseFloat(raw.lng),
          ts: parseInt(raw.ts, 10),
        });
      }
    }
    return locations;
  }

  // ── Lookup driver record for a user (used during socket connect) ──────────
  async getDriverByUserId(
    userId: string,
  ): Promise<{ id: string; companyId: string | null; isApproved: boolean } | null> {
    const driver = await this.driverRepo.findOne({
      where: { userId },
      select: ['id', 'companyId', 'isApproved'],
    });
    if (!driver) return null;
    return { id: driver.id, companyId: driver.companyId, isApproved: driver.isApproved };
  }
}

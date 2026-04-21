import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { Driver } from '../entities/index.js';

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
  ) {}

  // ── Called by EventsGateway on gps_update ─────────────────────────────────
  async updateLocation(
    driverId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    // 1. Geospatial index — powers GEOSEARCH (Step 17)
    //    GEOADD key longitude latitude member
    await this.redis.geoadd(DRIVERS_GEO_KEY, lng, lat, driverId);

    // 2. Hash for fast single-driver lookup without GEOPOS round-trip
    await this.redis.hset(`driver:loc:${driverId}`, {
      lat: String(lat),
      lng: String(lng),
      ts: String(Date.now()),
    });

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

  // ── Called when driver goes offline / disconnects ─────────────────────────
  async removeFromGeo(driverId: string): Promise<void> {
    await this.redis.zrem(DRIVERS_GEO_KEY, driverId);
    await this.redis.del(`driver:loc:${driverId}`);
    this.lastDbWrite.delete(driverId);
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

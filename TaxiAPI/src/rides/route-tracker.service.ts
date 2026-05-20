import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RideWaypoint } from '../entities/ride-waypoint.entity';

// ── Config ────────────────────────────────────────────────────────────────────

/** Flush the Redis buffer to DB after this many accumulated waypoints */
const FLUSH_EVERY = Number(process.env.ROUTE_FLUSH_EVERY ?? 15);

/** Redis key TTL for the waypoint buffer (seconds) — 8 h safety net */
const BUFFER_TTL_S = 28_800;

// ── Redis key helpers ─────────────────────────────────────────────────────────
const activeRideKey  = (driverId: string) => `driver:active_ride:${driverId}`;
const waypointBufKey = (rideId: string)   => `ride:wp:${rideId}`;

// ── Haversine (km) ────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Serialisation helpers ─────────────────────────────────────────────────────
interface WpPoint { lat: number; lng: number; ts: number }

function serialise(lat: number, lng: number): string {
  return JSON.stringify({ lat, lng, ts: Date.now() });
}

function deserialise(raw: string): WpPoint {
  return JSON.parse(raw) as WpPoint;
}

@Injectable()
export class RouteTrackerService {
  private readonly logger = new Logger(RouteTrackerService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(RideWaypoint) private readonly wpRepo: Repository<RideWaypoint>,
  ) {}

  // ── Driver ↔ active ride binding ─────────────────────────────────────────

  async setActiveRide(driverId: string, rideId: string): Promise<void> {
    await this.redis.setex(activeRideKey(driverId), BUFFER_TTL_S, rideId);
    this.logger.log(`Route tracking started: driver=${driverId} ride=${rideId}`);
  }

  async clearActiveRide(driverId: string): Promise<void> {
    await this.redis.del(activeRideKey(driverId));
  }

  async getActiveRideId(driverId: string): Promise<string | null> {
    return this.redis.get(activeRideKey(driverId));
  }

  // ── Waypoint recording ────────────────────────────────────────────────────

  /**
   * Push a new GPS fix into the Redis buffer.
   * Automatically flushes to DB every FLUSH_EVERY points to keep memory bounded.
   */
  async recordWaypoint(rideId: string, lat: number, lng: number): Promise<void> {
    const key = waypointBufKey(rideId);
    const len = await this.redis.rpush(key, serialise(lat, lng));
    await this.redis.expire(key, BUFFER_TTL_S);

    // Flush to DB on every Nth point (don't await — fire-and-forget)
    if (len % FLUSH_EVERY === 0) {
      void this.flushBuffer(rideId);
    }
  }

  // ── Route finalisation (called on ride completion) ────────────────────────

  /**
   * Flush remaining buffer, compute Haversine sum of all persisted waypoints,
   * and return the total actual distance in km.
   * Returns null if fewer than 2 waypoints were recorded.
   */
  async finalizeRoute(rideId: string): Promise<number | null> {
    await this.flushBuffer(rideId);

    const waypoints = await this.wpRepo.find({
      where: { rideId },
      order: { recordedAt: 'ASC' },
      select: ['lat', 'lng'],
    });

    if (waypoints.length < 2) return null;

    let totalKm = 0;
    for (let i = 1; i < waypoints.length; i++) {
      totalKm += haversineKm(
        Number(waypoints[i - 1].lat), Number(waypoints[i - 1].lng),
        Number(waypoints[i].lat),     Number(waypoints[i].lng),
      );
    }

    const rounded = Math.round(totalKm * 1000) / 1000;
    this.logger.log(`Route finalised: ride=${rideId} actualDistanceKm=${rounded}`);
    return rounded;
  }

  // ── Route retrieval ───────────────────────────────────────────────────────

  /** Returns all recorded waypoints ordered by time, for map polyline rendering. */
  async getRoute(rideId: string): Promise<Array<{ lat: number; lng: number; recordedAt: Date }>> {
    const rows = await this.wpRepo.find({
      where: { rideId },
      order: { recordedAt: 'ASC' },
      select: ['lat', 'lng', 'recordedAt'],
    });
    return rows.map(r => ({
      lat: Number(r.lat),
      lng: Number(r.lng),
      recordedAt: r.recordedAt,
    }));
  }

  // ── Private: flush buffer to DB ───────────────────────────────────────────

  private async flushBuffer(rideId: string): Promise<void> {
    const key  = waypointBufKey(rideId);
    const raw  = await this.redis.lrange(key, 0, -1);
    if (raw.length === 0) return;

    // Atomically remove the consumed entries
    await this.redis.ltrim(key, raw.length, -1);

    const entities = raw.map(s => {
      const { lat, lng, ts } = deserialise(s);
      return this.wpRepo.create({
        rideId,
        lat,
        lng,
        recordedAt: new Date(ts),
      });
    });

    try {
      await this.wpRepo.save(entities, { chunk: 100 });
    } catch (err) {
      this.logger.error(`Failed to flush ${entities.length} waypoints for ride ${rideId}`, err);
    }
  }
}

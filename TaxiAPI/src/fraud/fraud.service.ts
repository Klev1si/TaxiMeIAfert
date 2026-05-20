import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { FraudEvent, FraudEventType } from '../entities/fraud-event.entity';

// ── Constants (tunable via env) ───────────────────────────────────────────────

/** km/h above which a GPS jump is considered physically impossible for a taxi */
const GPS_SPOOF_MAX_SPEED_KMH = Number(process.env.GPS_SPOOF_MAX_SPEED_KMH ?? 250);

/** Number of total OTP failures before the phone is locked */
const OTP_LOCKOUT_THRESHOLD = Number(process.env.OTP_LOCKOUT_THRESHOLD ?? 5);

/** How long (seconds) a locked phone stays locked */
const OTP_LOCKOUT_SECONDS = Number(process.env.OTP_LOCKOUT_SECONDS ?? 1800); // 30 min

// ── Redis key helpers ─────────────────────────────────────────────────────────
const otpFailKey  = (phone: string) => `fraud:otp_fail:${phone}`;
const otpLockKey  = (phone: string) => `fraud:otp_lock:${phone}`;
const gpsLastKey  = (driverId: string) => `fraud:gps_last:${driverId}`;

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
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

// ── Service ───────────────────────────────────────────────────────────────────

export interface FraudEventDto {
  id:        string;
  type:      FraudEventType;
  userId:    string | null;
  driverId:  string | null;
  rideId:    string | null;
  metadata:  Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(
    @InjectRepository(FraudEvent)
    private readonly fraudRepo: Repository<FraudEvent>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  // ── Admin: paginated event list ───────────────────────────────────────────

  async getEvents(opts: {
    page:     number;
    limit:    number;
    type?:    FraudEventType;
    userId?:  string;
    driverId?: string;
  }): Promise<{ events: FraudEventDto[]; total: number }> {
    const qb = this.fraudRepo
      .createQueryBuilder('e')
      .orderBy('e.createdAt', 'DESC')
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit);

    if (opts.type)     qb.andWhere('e.type = :type',          { type:     opts.type });
    if (opts.userId)   qb.andWhere('e.userId = :userId',       { userId:   opts.userId });
    if (opts.driverId) qb.andWhere('e.driverId = :driverId',   { driverId: opts.driverId });

    const [events, total] = await qb.getManyAndCount();
    return { events: events.map(this.toDto), total };
  }

  // ── Rule 1: concurrent ride guard ─────────────────────────────────────────
  //  Call this before creating a ride. Returns the existing active ride ID if
  //  found, null otherwise. Caller decides whether to throw or warn.

  async checkConcurrentRide(
    clientId: string,
    userId:   string,
  ): Promise<string | null> {
    // Raw query so we don't have to import the Ride repo here
    const rows: Array<{ id: string }> = await this.fraudRepo.query(
      `SELECT id FROM rides
       WHERE client_id = $1
         AND status NOT IN ('completed','cancelled')
       LIMIT 1`,
      [clientId],
    );

    if (rows.length === 0) return null;

    const existingRideId = rows[0].id;
    void this.log({
      type:     'concurrent_ride_attempt',
      userId,
      metadata: { existingRideId },
    });
    return existingRideId;
  }

  // ── Rule 2: GPS teleport / spoof detection ─────────────────────────────────
  //  Call from GpsService.updateLocation(). Returns true if spoofing detected.

  async detectGpsSpoof(
    driverId: string,
    newLat:   number,
    newLng:   number,
  ): Promise<boolean> {
    const key = gpsLastKey(driverId);
    const now = Date.now();

    const raw = await this.redis.hgetall(key);
    if (raw.lat) {
      const prevLat = parseFloat(raw.lat);
      const prevLng = parseFloat(raw.lng);
      const prevTs  = parseInt(raw.ts, 10);
      const dtHours = (now - prevTs) / 3_600_000;

      if (dtHours > 0) {
        const distKm  = haversineKm(prevLat, prevLng, newLat, newLng);
        const speedKmh = distKm / dtHours;

        if (speedKmh > GPS_SPOOF_MAX_SPEED_KMH && distKm > 0.1) {
          this.logger.warn(
            `GPS spoof detected: driver=${driverId} speed=${speedKmh.toFixed(0)} km/h dist=${distKm.toFixed(2)} km`,
          );
          void this.log({
            type:     'gps_spoof_detected',
            driverId,
            metadata: {
              prevLat, prevLng, newLat, newLng,
              distKm:   Math.round(distKm * 100) / 100,
              speedKmh: Math.round(speedKmh),
              dtSeconds: Math.round(dtHours * 3600),
            },
          });
          // Update last known position even for flagged events (prevents repeat spam)
          await this.redis.hset(key, { lat: String(newLat), lng: String(newLng), ts: String(now) });
          await this.redis.expire(key, 3600);
          return true;
        }
      }
    }

    // Store current position for next comparison (TTL 1 hour: cleared when driver goes offline)
    await this.redis.hset(key, { lat: String(newLat), lng: String(newLng), ts: String(now) });
    await this.redis.expire(key, 3600);
    return false;
  }

  /** Clear last GPS snapshot when driver goes offline (prevents stale comparisons). */
  async clearGpsSnapshot(driverId: string): Promise<void> {
    await this.redis.del(gpsLastKey(driverId));
  }

  // ── Rule 3: OTP brute-force lockout ───────────────────────────────────────

  /** Returns true if the phone is currently locked. */
  async isPhoneLocked(phone: string): Promise<boolean> {
    const locked = await this.redis.exists(otpLockKey(phone));
    return locked === 1;
  }

  /** Returns seconds remaining on the lockout, or null if not locked. */
  async getLockoutTtl(phone: string): Promise<number | null> {
    const ttl = await this.redis.ttl(otpLockKey(phone));
    return ttl > 0 ? ttl : null;
  }

  /** Call on each failed OTP attempt. Locks the phone after threshold. */
  async recordOtpFailure(phone: string, userId?: string): Promise<void> {
    const count = await this.redis.incr(otpFailKey(phone));
    // Keep the counter for 24 h (reset daily)
    if (count === 1) await this.redis.expire(otpFailKey(phone), 86400);

    if (count >= OTP_LOCKOUT_THRESHOLD) {
      await this.redis.setex(otpLockKey(phone), OTP_LOCKOUT_SECONDS, '1');
      await this.redis.del(otpFailKey(phone)); // reset counter post-lockout
      this.logger.warn(`OTP lockout triggered for phone: ${phone}`);
      void this.log({
        type:     'otp_lockout',
        userId:   userId ?? null,
        metadata: { phone, lockoutSeconds: OTP_LOCKOUT_SECONDS },
      });
    }
  }

  /** Call on successful OTP verification to reset the failure counter. */
  async clearOtpFailures(phone: string): Promise<void> {
    await this.redis.del(otpFailKey(phone));
  }

  // ── Internal log helper (fire-and-forget, never throws) ───────────────────

  async log(params: {
    type:      FraudEventType;
    userId?:   string | null;
    driverId?: string | null;
    rideId?:   string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      const event = this.fraudRepo.create({
        type:     params.type,
        userId:   params.userId   ?? null,
        driverId: params.driverId ?? null,
        rideId:   params.rideId   ?? null,
        metadata: params.metadata ?? null,
      });
      await this.fraudRepo.save(event);
    } catch (err) {
      this.logger.error('Failed to persist fraud event', err);
    }
  }

  private toDto(e: FraudEvent): FraudEventDto {
    return {
      id:        e.id,
      type:      e.type,
      userId:    e.userId,
      driverId:  e.driverId,
      rideId:    e.rideId,
      metadata:  e.metadata,
      createdAt: e.createdAt,
    };
  }
}

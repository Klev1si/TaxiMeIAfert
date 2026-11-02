import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac } from 'node:crypto';
import { Client, PlatformSetting, PromoFingerprint, User } from '../entities/index.js';

/**
 * First-ride offer: new passengers get a discount (100 % = free) on their
 * first ride inside the city.
 *
 * Abuse protection — "used the offer, deleted the account, registered again":
 * a passenger is only eligible when BOTH
 *   1. the account has no completed rides, and
 *   2. none of its identities (phone, email, Google account, Apple account)
 *      has used the offer before — on any account, including deleted ones.
 * Identities are stored only as keyed one-way hashes (see PromoFingerprint).
 */
export interface FirstRideOffer {
  /** Whether new passengers get the offer at all. */
  enabled:     boolean;
  /** Discount on the first ride, 1–100 (100 = free). */
  discountPct: number;
  /** Rides longer than this (km) are not discounted ("inside the city"). */
  maxKm:       number;
}

export interface FirstRideOfferStatus extends FirstRideOffer {
  /** True when this passenger would get the offer on their next ride. */
  eligible: boolean;
}

type FingerprintSource = Pick<User, 'phone' | 'email' | 'googleSub' | 'appleSub'>;

const SETTING_KEY = 'first_ride_offer';
const CACHE_MS    = 30_000;

const DEFAULT_OFFER: FirstRideOffer = {
  enabled:     true,
  discountPct: 100,
  maxKm:       Number(process.env.FREE_FIRST_RIDE_MAX_KM ?? 10),
};

/** Normalise an email so trivial variations map to the same person:
 *  case, "+tag" suffixes, and dots in Gmail addresses. */
export function normaliseEmail(email: string): string {
  const [rawLocal, rawDomain] = email.trim().toLowerCase().split('@');
  if (!rawLocal || !rawDomain) return email.trim().toLowerCase();
  let local = rawLocal.split('+')[0];
  const domain = rawDomain === 'googlemail.com' ? 'gmail.com' : rawDomain;
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** Normalise a phone number: keep digits and a leading +, treat 00 as +. */
export function normalisePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return digits;
}

@Injectable()
export class FirstRideOfferService {
  private readonly logger = new Logger(FirstRideOfferService.name);
  private cache: { offer: FirstRideOffer; at: number } | null = null;

  constructor(
    @InjectRepository(PlatformSetting)  private readonly settingsRepo: Repository<PlatformSetting>,
    @InjectRepository(PromoFingerprint) private readonly fpRepo: Repository<PromoFingerprint>,
    @InjectRepository(Client)           private readonly clientRepo: Repository<Client>,
    @InjectRepository(User)             private readonly userRepo: Repository<User>,
  ) {}

  // ── Settings ───────────────────────────────────────────────────────────────

  async getOffer(): Promise<FirstRideOffer> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.offer;
    let offer = DEFAULT_OFFER;
    try {
      const row = await this.settingsRepo.findOne({ where: { key: SETTING_KEY } });
      if (row) offer = sanitise({ ...DEFAULT_OFFER, ...(row.value as Partial<FirstRideOffer>) });
    } catch (err) {
      // Table missing (migration not run yet) — keep the defaults.
      this.logger.warn(`Could not read first-ride offer settings: ${(err as Error).message}`);
    }
    this.cache = { offer, at: Date.now() };
    return offer;
  }

  async updateOffer(patch: Partial<FirstRideOffer>): Promise<FirstRideOffer> {
    const offer = sanitise({ ...(await this.getOffer()), ...patch });
    await this.settingsRepo.save({ key: SETTING_KEY, value: { ...offer } });
    this.cache = { offer, at: Date.now() };
    return offer;
  }

  // ── Fingerprints ───────────────────────────────────────────────────────────

  /** Keyed hashes of every identity attached to this user. */
  fingerprints(user: FingerprintSource): Array<{ fingerprint: string; kind: string }> {
    const ids: Array<[string, string | null | undefined]> = [
      // Deleted accounts carry a "del_…" placeholder phone — not an identity.
      ['phone',  user.phone && !user.phone.startsWith('del_') ? normalisePhone(user.phone) : null],
      ['email',  user.email ? normaliseEmail(user.email) : null],
      ['google', user.googleSub],
      ['apple',  user.appleSub],
    ];
    return ids
      .filter((entry): entry is [string, string] => !!entry[1])
      .map(([kind, value]) => ({ kind, fingerprint: hmac(`${kind}:${value}`) }));
  }

  /** Has any identity of this user already used the first-ride offer? */
  async hasUsedOffer(user: FingerprintSource): Promise<boolean> {
    const fps = this.fingerprints(user).map((f) => f.fingerprint);
    if (fps.length === 0) return false;
    try {
      const count = await this.fpRepo.createQueryBuilder('f')
        .where('f.fingerprint IN (:...fps)', { fps })
        .getCount();
      return count > 0;
    } catch (err) {
      // Fail closed: if we can't check, don't give a free ride away.
      this.logger.error(`Fingerprint lookup failed: ${(err as Error).message}`);
      return true;
    }
  }

  /** Remember this user's identities as having used the offer. Idempotent. */
  async recordUsage(user: FingerprintSource): Promise<void> {
    const rows = this.fingerprints(user);
    if (rows.length === 0) return;
    try {
      await this.fpRepo.createQueryBuilder()
        .insert()
        .into(PromoFingerprint)
        .values(rows)
        .orIgnore()
        .execute();
    } catch (err) {
      this.logger.error(`Failed to record promo fingerprints: ${(err as Error).message}`);
    }
  }

  // ── Eligibility ────────────────────────────────────────────────────────────

  /** Eligibility check used when a ride completes and by the app's banner. */
  async isEligible(user: FingerprintSource, totalRides: number): Promise<boolean> {
    const offer = await this.getOffer();
    if (!offer.enabled || totalRides > 0) return false;
    return !(await this.hasUsedOffer(user));
  }

  /** Offer + eligibility for the logged-in passenger (GET /first-ride-offer). */
  async statusForUser(userId: string): Promise<FirstRideOfferStatus> {
    const offer = await this.getOffer();
    const [user, client] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      this.clientRepo.findOne({ where: { userId }, select: ['id', 'totalRides'] }),
    ]);
    const eligible = !!user && !!client && await this.isEligible(user, client.totalRides ?? 0);
    return { ...offer, eligible };
  }
}

function hmac(input: string): string {
  // A dedicated secret is recommended: if this key changes, previously
  // recorded fingerprints no longer match.
  const secret = process.env.PROMO_FINGERPRINT_SECRET ?? process.env.JWT_SECRET ?? '';
  return createHmac('sha256', secret).update(input).digest('hex');
}

function sanitise(o: FirstRideOffer): FirstRideOffer {
  const pct = Math.round(Number(o.discountPct));
  const km  = Number(o.maxKm);
  return {
    enabled:     o.enabled !== false,
    discountPct: Number.isFinite(pct) ? Math.min(100, Math.max(1, pct)) : DEFAULT_OFFER.discountPct,
    maxKm:       Number.isFinite(km) && km > 0 ? Math.min(1000, km) : DEFAULT_OFFER.maxKm,
  };
}

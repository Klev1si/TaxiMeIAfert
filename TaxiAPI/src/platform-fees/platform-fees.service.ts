import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSetting } from '../entities/index.js';

/**
 * Platform-wide fees an admin can change without a deploy.
 *
 * cardFeePct — taken from every CARD-paid ride (covers card processing and
 * operations), for every kind of driver and contract. Who carries it:
 *   - company drivers: the company's share (the driver always gets their agreed %)
 *   - solo drivers:    the driver
 * The rate is snapshotted on each ride when the card payment is confirmed
 * (rides.card_fee_pct), so changing it never rewrites past rides.
 */
export interface PlatformFees {
  cardFeePct: number;
}

/** Rate used for card rides paid before the per-ride snapshot existed. */
export const LEGACY_CARD_FEE_PCT = Number(process.env.PLATFORM_CARD_COMMISSION_PCT ?? 10);

const SETTING_KEY = 'platform_fees';
const CACHE_MS    = 30_000;
const DEFAULTS: PlatformFees = { cardFeePct: LEGACY_CARD_FEE_PCT };

export function sanitiseFees(f: Partial<PlatformFees>): PlatformFees {
  const pct = Number(f.cardFeePct);
  return {
    cardFeePct: Number.isFinite(pct) ? Math.min(50, Math.max(0, Math.round(pct * 100) / 100)) : DEFAULTS.cardFeePct,
  };
}

@Injectable()
export class PlatformFeesService {
  private readonly logger = new Logger(PlatformFeesService.name);
  private cache: { fees: PlatformFees; at: number } | null = null;

  constructor(
    @InjectRepository(PlatformSetting) private readonly settingsRepo: Repository<PlatformSetting>,
  ) {}

  async get(): Promise<PlatformFees> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.fees;
    let fees = DEFAULTS;
    try {
      const row = await this.settingsRepo.findOne({ where: { key: SETTING_KEY } });
      if (row) fees = sanitiseFees({ ...DEFAULTS, ...(row.value as Partial<PlatformFees>) });
    } catch (err) {
      this.logger.warn(`Could not read platform fees: ${(err as Error).message}`);
    }
    this.cache = { fees, at: Date.now() };
    return fees;
  }

  async update(patch: Partial<PlatformFees>): Promise<PlatformFees> {
    const fees = sanitiseFees({ ...(await this.get()), ...patch });
    await this.settingsRepo.save({ key: SETTING_KEY, value: { ...fees } });
    this.cache = { fees, at: Date.now() };
    return fees;
  }
}

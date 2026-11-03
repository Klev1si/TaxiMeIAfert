/**
 * AdminFinancesService — cross-cutting financial view for super-admin.
 * Per-driver and per-company breakdown of cash / card / driver share /
 * company share / platform fee. Honours each driver's effective commission
 * (override → company default → solo).
 */
import { Injectable } from '@nestjs/common';
import { LEGACY_CARD_FEE_PCT } from '../platform-fees/platform-fees.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Company, Driver, PlatformCredit, Ride } from '../entities';
import { PlatformCreditReason } from '../entities/platform-credit.entity';
import { RideStatus } from '../common/enums';



const DEFAULT_DRIVER_PCT = Number(process.env.DRIVER_COMMISSION_PCT ?? 80);

export type FinancePeriod = 'today' | 'week' | 'month' | 'all';

function periodStart(p: FinancePeriod): Date | null {
  const now = new Date();
  switch (p) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      return d;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'all':
    default:
      return null;
  }
}

export interface AdminDriverFinanceDto {
  driverId:       string;
  firstName:      string;
  lastName:       string;
  vehiclePlate:   string;
  companyId:      string | null;
  companyName:    string | null;
  cashTotal:      number;
  cardTotal:      number;
  /** Driver's share (cash share + card share after platform fee). */
  driverEarning:  number;
  /** Company's share (0 for solo). */
  companyEarning: number;
  /** Platform's total: commission (commission contracts) + card fee. */
  platformEarning: number;
  platformCommission: number;
  cardFee:         number;
  /** What the platform owes the driver from cards (= card share for solo,
   *  card share-driver-portion for company drivers). */
  cardDueToDriver: number;
  /** Effective commission % used (100 for solo). */
  effectiveCommissionPct: number;
}

export interface AdminCompanyFinanceDto {
  companyId:      string;
  companyName:    string;
  driverCount:    number;
  cashTotal:      number;
  cardTotal:      number;
  driverEarning:  number;
  companyEarning: number;
  platformEarning: number;
  /** Total platform owes drivers in this company from card payments. */
  cardDueToDrivers: number;
}

@Injectable()
export class AdminFinancesService {
  constructor(
    @InjectRepository(Driver)         private readonly driverRepo:         Repository<Driver>,
    @InjectRepository(Company)        private readonly companyRepo:        Repository<Company>,
    @InjectRepository(Ride)           private readonly rideRepo:           Repository<Ride>,
    @InjectRepository(PlatformCredit) private readonly platformCreditRepo: Repository<PlatformCredit>,
  ) {}

  /**
   * Summarise platform-funded promo spend over the given period. Breaks the
   * total down by reason so admin can see what acquisition / promo flows are
   * costing the platform.
   */
  async getPlatformCreditsSummary(period: FinancePeriod): Promise<{
    period: FinancePeriod;
    total:  number;
    count:  number;
    byReason: Record<PlatformCreditReason, { total: number; count: number }>;
  }> {
    const start = periodStart(period);
    const where = start ? { createdAt: MoreThanOrEqual(start) } : {};
    const rows = await this.platformCreditRepo.find({ where });

    const byReason: Record<PlatformCreditReason, { total: number; count: number }> = {
      [PlatformCreditReason.FIRST_RIDE_PROMO]:  { total: 0, count: 0 },
      [PlatformCreditReason.ADMIN_PROMO_CODE]:  { total: 0, count: 0 },
    };
    let total = 0;
    for (const r of rows) {
      const amt = Number(r.amount);
      total += amt;
      byReason[r.reason].total += amt;
      byReason[r.reason].count += 1;
    }
    return {
      period,
      total: Math.round(total * 100) / 100,
      count: rows.length,
      byReason: Object.fromEntries(
        Object.entries(byReason).map(([k, v]) => [
          k,
          { total: Math.round(v.total * 100) / 100, count: v.count },
        ]),
      ) as Record<PlatformCreditReason, { total: number; count: number }>,
    };
  }

  /** Per-driver breakdown across the whole platform (solo + company drivers). */
  async getDrivers(period: FinancePeriod): Promise<AdminDriverFinanceDto[]> {
    const since = periodStart(period);

    const rows = await this.rideRepo.query(
      `SELECT
         d.id                       AS "driverId",
         d.first_name               AS "firstName",
         d.last_name                AS "lastName",
         d.vehicle_plate            AS "vehiclePlate",
         d.commission_pct_override  AS "overridePct",
         d.company_id               AS "companyId",
         c.name                     AS "companyName",
         c.driver_commission_pct    AS "companyDefaultPct",
         COALESCE(SUM(CASE WHEN dl.payment_method = 'cash' THEN r.total_fare END), 0)::numeric AS cash_total,
         COALESCE(SUM(CASE WHEN dl.payment_method = 'card' THEN r.total_fare END), 0)::numeric AS card_total,
         -- Full ride price (passenger paid + platform-funded discount)
         COALESCE(SUM(CASE WHEN dl.payment_method = 'cash' THEN r.total_fare + COALESCE(pc.amount, 0) END), 0)::numeric AS gross_cash,
         COALESCE(SUM(CASE WHEN dl.payment_method = 'card' THEN r.total_fare + COALESCE(pc.amount, 0) END), 0)::numeric AS gross_card,
         -- Platform commission (commission contracts), each ride at its own snapshotted rate
         COALESCE(SUM(CASE WHEN dl.payment_method = 'cash' THEN ROUND(((r.total_fare + COALESCE(pc.amount, 0)) * COALESCE(r.platform_commission_pct, 0) / 100)::numeric, 2) END), 0)::numeric AS commission_cash,
         COALESCE(SUM(CASE WHEN dl.payment_method = 'card' THEN ROUND(((r.total_fare + COALESCE(pc.amount, 0)) * COALESCE(r.platform_commission_pct, 0) / 100)::numeric, 2) END), 0)::numeric AS commission_card,
         -- Card fee on what was charged, at the ride's snapshotted rate
         COALESCE(SUM(CASE WHEN dl.payment_method = 'card' THEN ROUND((r.total_fare * COALESCE(r.card_fee_pct, ${LEGACY_CARD_FEE_PCT}) / 100)::numeric, 2) END), 0)::numeric AS card_fee
       FROM drivers d
       LEFT JOIN companies c ON c.id = d.company_id
       LEFT JOIN rides r
         ON r.driver_id = d.id
        AND r.status = $1
        AND r.total_fare IS NOT NULL
        ${since ? 'AND r.completed_at >= $2' : ''}
       LEFT JOIN driver_ledger dl
         ON dl.ride_id = r.id
        AND dl.driver_id = d.id
        AND dl.type = 'credit'
       LEFT JOIN platform_credits pc ON pc.ride_id = r.id
       GROUP BY d.id, d.first_name, d.last_name, d.vehicle_plate,
                d.commission_pct_override, d.company_id, c.name,
                c.driver_commission_pct
       ORDER BY d.first_name, d.last_name`,
      since ? [RideStatus.COMPLETED, since] : [RideStatus.COMPLETED],
    ) as Array<{
      driverId: string; firstName: string; lastName: string; vehiclePlate: string;
      overridePct: string | null;
      companyId: string | null;
      companyName: string | null;
      companyDefaultPct: string | null;
      cash_total: string; card_total: string;
      gross_cash: string; gross_card: string;
      commission_cash: string; commission_card: string; card_fee: string;
    }>;

    const round = (n: number) => Math.round(n * 100) / 100;

    return rows.map(row => {
      const cashTotal = Number(row.cash_total);
      const cardTotal = Number(row.card_total);
      let effectivePct: number;
      if (row.companyId) {
        effectivePct = row.overridePct != null
          ? Number(row.overridePct)
          : (row.companyDefaultPct != null
              ? Number(row.companyDefaultPct)
              : DEFAULT_DRIVER_PCT);
      } else {
        effectivePct = 100; // Solo driver keeps the full split on cash
      }
      // Driver keeps their % of the full fare (100 % for solo drivers, minus
      // the platform's fees); platform = commission + card fee; company = rest.
      const solo = !row.companyId;
      const grossCash = Number(row.gross_cash), grossCard = Number(row.gross_card);
      const commCash = Number(row.commission_cash), commCard = Number(row.commission_card);
      const cardFee  = Number(row.card_fee);
      const platformEarning = commCash + commCard + cardFee;
      const cashDriver = solo ? grossCash - commCash : grossCash * effectivePct / 100;
      const cardDriver = solo ? grossCard - commCard - cardFee : grossCard * effectivePct / 100;
      const driverEarning   = cashDriver + cardDriver;
      const companyEarning  = solo ? 0 : grossCash + grossCard - driverEarning - platformEarning;
      // What the platform owes the driver from card money it collected.
      const cardDueToDriver = cardDriver;
      return {
        driverId:        row.driverId,
        firstName:       row.firstName,
        lastName:        row.lastName,
        vehiclePlate:    row.vehiclePlate,
        companyId:       row.companyId,
        companyName:     row.companyName,
        cashTotal:       round(cashTotal),
        cardTotal:       round(cardTotal),
        driverEarning:   round(driverEarning),
        companyEarning:  round(companyEarning),
        platformEarning: round(platformEarning),
        platformCommission: round(commCash + commCard),
        cardFee:         round(cardFee),
        cardDueToDriver: round(cardDueToDriver),
        effectiveCommissionPct: round(effectivePct),
      };
    });
  }

  /** Aggregated per-company breakdown. Solo drivers are excluded. */
  async getCompanies(period: FinancePeriod): Promise<AdminCompanyFinanceDto[]> {
    const drivers = await this.getDrivers(period);
    const byCompany = new Map<string, AdminCompanyFinanceDto>();
    for (const d of drivers) {
      if (!d.companyId || !d.companyName) continue; // skip solos
      const existing = byCompany.get(d.companyId);
      if (existing) {
        existing.driverCount     += 1;
        existing.cashTotal       += d.cashTotal;
        existing.cardTotal       += d.cardTotal;
        existing.driverEarning   += d.driverEarning;
        existing.companyEarning  += d.companyEarning;
        existing.platformEarning += d.platformEarning;
        existing.cardDueToDrivers += d.cardDueToDriver;
      } else {
        byCompany.set(d.companyId, {
          companyId:        d.companyId,
          companyName:      d.companyName,
          driverCount:      1,
          cashTotal:        d.cashTotal,
          cardTotal:        d.cardTotal,
          driverEarning:    d.driverEarning,
          companyEarning:   d.companyEarning,
          platformEarning:  d.platformEarning,
          cardDueToDrivers: d.cardDueToDriver,
        });
      }
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    // Re-round after JS additions accumulate floating drift.
    return Array.from(byCompany.values())
      .map(c => ({
        ...c,
        cashTotal:        round(c.cashTotal),
        cardTotal:        round(c.cardTotal),
        driverEarning:    round(c.driverEarning),
        companyEarning:   round(c.companyEarning),
        platformEarning:  round(c.platformEarning),
        cardDueToDrivers: round(c.cardDueToDrivers),
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
  }
}

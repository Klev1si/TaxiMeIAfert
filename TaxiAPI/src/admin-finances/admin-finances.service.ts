/**
 * AdminFinancesService — cross-cutting financial view for super-admin.
 * Per-driver and per-company breakdown of cash / card / driver share /
 * company share / platform fee. Honours each driver's effective commission
 * (override → company default → solo).
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, Driver, Ride } from '../entities';
import { RideStatus } from '../common/enums';

const PLATFORM_CARD_COMMISSION_PCT = Number(
  process.env.PLATFORM_CARD_COMMISSION_PCT ?? 10,
);

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
  /** Platform fee from card rides (10% of card gross). */
  platformEarning: number;
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
    @InjectRepository(Driver)  private readonly driverRepo:  Repository<Driver>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Ride)    private readonly rideRepo:    Repository<Ride>,
  ) {}

  /** Per-driver breakdown across the whole platform (solo + company drivers). */
  async getDrivers(period: FinancePeriod): Promise<AdminDriverFinanceDto[]> {
    const since = periodStart(period);
    const platformPct = PLATFORM_CARD_COMMISSION_PCT / 100;

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
         COALESCE(SUM(r.total_fare) FILTER (WHERE dl.payment_method = 'cash'), 0)::numeric AS cash_total,
         COALESCE(SUM(r.total_fare) FILTER (WHERE dl.payment_method = 'card'), 0)::numeric AS card_total
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
      const driverFrac  = effectivePct / 100;
      const companyFrac = 1 - driverFrac;
      const cardAfter   = cardTotal * (1 - platformPct);
      const driverEarning   = cashTotal * driverFrac + cardAfter * driverFrac;
      const companyEarning  = cashTotal * companyFrac + cardAfter * companyFrac;
      const platformEarning = cardTotal * platformPct;
      const cardDueToDriver = cardAfter * driverFrac;
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

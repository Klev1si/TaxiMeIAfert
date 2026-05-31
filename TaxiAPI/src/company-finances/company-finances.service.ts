/**
 * CompanyFinancesService — per-driver and overall money tracking for a
 * company. Computes from rides + driver_ledger + company_settlements so
 * we don't have to maintain a denormalised state.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, Driver, Ride } from '../entities';
import {
  CompanySettlement,
  SettlementDirection,
} from '../entities/company-settlement.entity';
import { RideStatus } from '../common/enums';

const PLATFORM_CARD_COMMISSION_PCT = Number(
  process.env.PLATFORM_CARD_COMMISSION_PCT ?? 10,
);

export type FinancePeriod = 'today' | 'week' | 'month' | 'all';

/** Convert a period name into a `since` Date (null = no lower bound). */
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

export interface DriverFinanceDto {
  driverId:        string;
  firstName:       string;
  lastName:        string;
  vehiclePlate:    string;
  /** Sum of cash-paid ride fares the driver collected from passengers. */
  cashCollected:   number;
  /** Cash share the company is owed by this driver (after subtracting settlements). */
  cashOwedToCompany: number;
  /** Sum of card-paid ride fares (gross). */
  cardTotal:       number;
  /** Driver's share of card rides the company still owes (after settlements). */
  cardOwedToDriver: number;
}

export interface CompanySummaryDto {
  /** Company's revenue from cash rides (their commission share). */
  cashRevenue:        number;
  /** Company's revenue from card rides (after platform fee). */
  cardRevenue:        number;
  /** Total revenue across both. */
  totalRevenue:       number;
  /** Total cash drivers still owe the company, after settlements. */
  cashOwedByDrivers:  number;
  /** Total card share still owed to drivers, after settlements. */
  cardOwedToDrivers:  number;
}

@Injectable()
export class CompanyFinancesService {
  constructor(
    @InjectRepository(Company)            private readonly companyRepo: Repository<Company>,
    @InjectRepository(Driver)             private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Ride)               private readonly rideRepo: Repository<Ride>,
    @InjectRepository(CompanySettlement)  private readonly settleRepo: Repository<CompanySettlement>,
  ) {}

  /** Resolve the company record for a user, throws if none. */
  private async resolveCompany(userId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { userId } });
    if (!company) throw new NotFoundException('Company profile not found');
    return company;
  }

  /**
   * Per-driver breakdown. The `period` filter applies to RIDES — settlements
   * are always all-time because they represent real money exchanges that
   * shouldn't be hidden by a period switch.
   */
  async getDrivers(userId: string, period: FinancePeriod): Promise<DriverFinanceDto[]> {
    const company = await this.resolveCompany(userId);
    const since   = periodStart(period);
    const driverPct   = Number(company.driverCommissionPct) / 100;
    const companyPct  = 1 - driverPct;
    const platformPct = PLATFORM_CARD_COMMISSION_PCT / 100;

    // Sum rides per driver, split by cash/card via driver_ledger.payment_method.
    const rideTotals = await this.rideRepo.query(
      `SELECT
         d.id            AS "driverId",
         d.first_name    AS "firstName",
         d.last_name     AS "lastName",
         d.vehicle_plate AS "vehiclePlate",
         COALESCE(SUM(r.total_fare) FILTER (WHERE dl.payment_method = 'cash'), 0)::numeric AS cash_total,
         COALESCE(SUM(r.total_fare) FILTER (WHERE dl.payment_method = 'card'), 0)::numeric AS card_total
       FROM drivers d
       LEFT JOIN rides r
         ON r.driver_id = d.id
        AND r.status = $1
        AND r.total_fare IS NOT NULL
        ${since ? 'AND r.completed_at >= $3' : ''}
       LEFT JOIN driver_ledger dl
         ON dl.ride_id = r.id
        AND dl.driver_id = d.id
        AND dl.type = 'credit'
       WHERE d.company_id = $2
       GROUP BY d.id, d.first_name, d.last_name, d.vehicle_plate`,
      since ? [RideStatus.COMPLETED, company.id, since] : [RideStatus.COMPLETED, company.id],
    ) as Array<{
      driverId: string; firstName: string; lastName: string; vehiclePlate: string;
      cash_total: string; card_total: string;
    }>;

    // Pull settlements once for all drivers, group in JS — small dataset, no
    // need for a window-function query.
    const settlements = await this.settleRepo.find({
      where: { companyId: company.id },
    });
    const settledCashIn  = new Map<string, number>(); // driverId → sum
    const settledCardOut = new Map<string, number>();
    for (const s of settlements) {
      const map = s.direction === 'cash_in' ? settledCashIn : settledCardOut;
      map.set(s.driverId, (map.get(s.driverId) ?? 0) + Number(s.amount));
    }

    const round = (n: number) => Math.round(n * 100) / 100;

    return rideTotals.map(row => {
      const cashTotal = Number(row.cash_total);
      const cardTotal = Number(row.card_total);
      const cashOwed  = cashTotal * companyPct;                          // driver collected cash, owes company this much
      const cardOwed  = cardTotal * (1 - platformPct) * driverPct;       // company owes driver this much
      return {
        driverId:          row.driverId,
        firstName:         row.firstName,
        lastName:          row.lastName,
        vehiclePlate:      row.vehiclePlate,
        cashCollected:     round(cashTotal),
        cashOwedToCompany: round(cashOwed  - (settledCashIn.get(row.driverId)  ?? 0)),
        cardTotal:         round(cardTotal),
        cardOwedToDriver:  round(cardOwed  - (settledCardOut.get(row.driverId) ?? 0)),
      };
    });
  }

  /** Aggregated totals across all drivers. */
  async getSummary(userId: string, period: FinancePeriod): Promise<CompanySummaryDto> {
    const drivers = await this.getDrivers(userId, period);
    const company = await this.resolveCompany(userId);
    const driverPct   = Number(company.driverCommissionPct) / 100;
    const companyPct  = 1 - driverPct;
    const platformPct = PLATFORM_CARD_COMMISSION_PCT / 100;

    let cashTotal = 0, cardTotal = 0, cashOwed = 0, cardOwed = 0;
    for (const d of drivers) {
      cashTotal += d.cashCollected;
      cardTotal += d.cardTotal;
      cashOwed  += d.cashOwedToCompany;
      cardOwed  += d.cardOwedToDriver;
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    const cashRevenue = cashTotal * companyPct;
    const cardRevenue = cardTotal * (1 - platformPct) * companyPct;
    return {
      cashRevenue:       round(cashRevenue),
      cardRevenue:       round(cardRevenue),
      totalRevenue:      round(cashRevenue + cardRevenue),
      cashOwedByDrivers: round(cashOwed),
      cardOwedToDrivers: round(cardOwed),
    };
  }

  /**
   * Record a settlement between the company and a driver. `cash_in` =
   * driver handed cash to company; `card_out` = company paid driver.
   * Driver must belong to this company.
   */
  async settle(
    userId:     string,
    driverId:   string,
    direction:  SettlementDirection,
    amount:     number,
    note?:      string,
  ): Promise<CompanySettlement> {
    const company = await this.resolveCompany(userId);
    const driver  = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver || driver.companyId !== company.id) {
      throw new NotFoundException('Driver not found in your company');
    }
    if (amount <= 0) {
      throw new NotFoundException('Settlement amount must be positive');
    }
    const settlement = this.settleRepo.create({
      companyId: company.id,
      driverId,
      direction,
      amount: Math.round(amount * 100) / 100,
      note: note ?? null,
    });
    return this.settleRepo.save(settlement);
  }
}

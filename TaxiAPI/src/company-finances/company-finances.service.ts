/**
 * CompanyFinancesService — per-driver and overall money tracking for a
 * company. Computes from rides + driver_ledger + company_settlements so
 * we don't have to maintain a denormalised state.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, Driver, Expense, Ride } from '../entities';
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
  /** Sum of expenses (fuel, repairs, etc.) the driver logged in this period. */
  expensesTotal:   number;
  // ── 3-way breakdown for this driver's rides in the period ─────────────────
  /** Driver's total earning (cash share + card share after platform fee). */
  driverEarning:   number;
  /** Company's total revenue from this driver (cash share + card share). */
  companyEarning:  number;
  /** Platform fee taken from this driver's card rides (10% of card gross). */
  platformEarning: number;
  /** Effective driver commission % used for this driver (override or default). */
  effectiveCommissionPct: number;
  /** True when a per-driver override is set (vs. company default). */
  hasCommissionOverride:  boolean;
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
  // ── Card-payment breakdown (transparency on where the money goes) ───────
  /** Gross sum of card-paid ride fares (before any deductions). */
  cardGross:          number;
  /** 10% (configurable) that the platform deducted from card rides. */
  platformFee:        number;
  /** Driver share of card rides (the 70% × 90% portion in 70/30 split). */
  cardDriverShare:    number;
  /** Sum of driver-logged expenses (fuel, repairs, etc.) for the period. */
  driverExpenses:     number;
  // ── Percentages so the UI doesn't have to derive them ───────────────────
  /** Company's commission percentage (e.g. 30 in a 70/30 split). */
  companyCommissionPct: number;
  /** Driver's commission percentage (e.g. 70). */
  driverCommissionPct:  number;
  /** Platform's commission percentage on card rides (e.g. 10). */
  platformCommissionPct: number;
}

@Injectable()
export class CompanyFinancesService {
  constructor(
    @InjectRepository(Company)            private readonly companyRepo: Repository<Company>,
    @InjectRepository(Driver)             private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Ride)               private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Expense)            private readonly expenseRepo: Repository<Expense>,
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
    const companyDefaultPct = Number(company.driverCommissionPct);
    const platformPct       = PLATFORM_CARD_COMMISSION_PCT / 100;

    // Sum rides per driver, split by cash/card via driver_ledger.payment_method.
    // Also select the driver's commission_pct_override so per-driver splits are
    // possible without a second roundtrip.
    const rideTotals = await this.rideRepo.query(
      `SELECT
         d.id                       AS "driverId",
         d.first_name               AS "firstName",
         d.last_name                AS "lastName",
         d.vehicle_plate            AS "vehiclePlate",
         d.commission_pct_override  AS "overridePct",
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
       GROUP BY d.id, d.first_name, d.last_name, d.vehicle_plate, d.commission_pct_override`,
      since ? [RideStatus.COMPLETED, company.id, since] : [RideStatus.COMPLETED, company.id],
    ) as Array<{
      driverId: string; firstName: string; lastName: string; vehiclePlate: string;
      overridePct: string | null;
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

    // Expenses per driver in the same period — fuel, repairs, etc. Logged
    // by the drivers themselves on their Expenses screen.
    const driverIds = rideTotals.map(r => r.driverId);
    const expensesByDriver = new Map<string, number>();
    if (driverIds.length > 0) {
      const qb = this.expenseRepo
        .createQueryBuilder('e')
        .select('e.driver_id', 'driverId')
        .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
        .where('e.driver_id IN (:...ids)', { ids: driverIds })
        .groupBy('e.driver_id');
      if (since) qb.andWhere('e.expense_date >= :since', { since });
      const rows = await qb.getRawMany<{ driverId: string; total: string }>();
      for (const r of rows) expensesByDriver.set(r.driverId, Number(r.total));
    }

    const round = (n: number) => Math.round(n * 100) / 100;

    return rideTotals.map(row => {
      const cashTotal = Number(row.cash_total);
      const cardTotal = Number(row.card_total);
      const hasOverride = row.overridePct != null;
      const effectivePct = hasOverride
        ? Number(row.overridePct)
        : companyDefaultPct;
      const driverFrac  = effectivePct / 100;
      const companyFrac = 1 - driverFrac;

      const cashOwed  = cashTotal * companyFrac;                       // driver collected cash, owes company this
      const cardAfter = cardTotal * (1 - platformPct);
      const cardOwed  = cardAfter * driverFrac;                        // company owes driver this from card
      // Earnings (gross, ignoring settlements):
      const driverEarning   = cashTotal * driverFrac + cardAfter * driverFrac;
      const companyEarning  = cashTotal * companyFrac + cardAfter * companyFrac;
      const platformEarning = cardTotal * platformPct;

      return {
        driverId:          row.driverId,
        firstName:         row.firstName,
        lastName:          row.lastName,
        vehiclePlate:      row.vehiclePlate,
        cashCollected:     round(cashTotal),
        cashOwedToCompany: round(cashOwed  - (settledCashIn.get(row.driverId)  ?? 0)),
        cardTotal:         round(cardTotal),
        cardOwedToDriver:  round(cardOwed  - (settledCardOut.get(row.driverId) ?? 0)),
        expensesTotal:     round(expensesByDriver.get(row.driverId) ?? 0),
        driverEarning:     round(driverEarning),
        companyEarning:    round(companyEarning),
        platformEarning:   round(platformEarning),
        effectiveCommissionPct: round(effectivePct),
        hasCommissionOverride:  hasOverride,
      };
    });
  }

  /**
   * Set or clear a driver's commission override. Pass `null` to revert to
   * the company default. Driver must belong to the calling user's company.
   */
  async setDriverCommission(
    userId:   string,
    driverId: string,
    pct:      number | null,
  ): Promise<{ effectivePct: number; hasOverride: boolean }> {
    const company = await this.resolveCompany(userId);
    const driver  = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver || driver.companyId !== company.id) {
      throw new NotFoundException('Driver not found in your company');
    }
    if (pct != null && (pct < 0 || pct > 100)) {
      throw new NotFoundException('Commission percentage must be between 0 and 100');
    }
    driver.commissionPctOverride = pct != null ? Math.round(pct * 100) / 100 : null;
    await this.driverRepo.save(driver);
    return {
      effectivePct: pct ?? Number(company.driverCommissionPct),
      hasOverride:  pct != null,
    };
  }

  /** Aggregated totals across all drivers. */
  async getSummary(userId: string, period: FinancePeriod): Promise<CompanySummaryDto> {
    const drivers = await this.getDrivers(userId, period);
    const company = await this.resolveCompany(userId);
    const companyDefaultDriverPct = Number(company.driverCommissionPct);
    const platformPct = PLATFORM_CARD_COMMISSION_PCT / 100;

    // Aggregate from the per-driver DTOs so per-driver commission overrides
    // are reflected in the totals — sum the company/driver shares as we
    // iterate rather than re-applying a single company-wide split.
    let cashTotal = 0, cardTotal = 0, cashOwed = 0, cardOwed = 0, expenses = 0;
    let cashRevenue = 0, cardRevenue = 0, cardDriverShare = 0;
    for (const d of drivers) {
      cashTotal += d.cashCollected;
      cardTotal += d.cardTotal;
      cashOwed  += d.cashOwedToCompany;
      cardOwed  += d.cardOwedToDriver;
      expenses  += d.expensesTotal;
      const driverFrac  = d.effectiveCommissionPct / 100;
      const companyFrac = 1 - driverFrac;
      const dCardAfter  = d.cardTotal * (1 - platformPct);
      cashRevenue     += d.cashCollected * companyFrac;
      cardRevenue     += dCardAfter * companyFrac;
      cardDriverShare += dCardAfter * driverFrac;
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    const platformFee = cardTotal * platformPct;
    return {
      cashRevenue:           round(cashRevenue),
      cardRevenue:           round(cardRevenue),
      totalRevenue:          round(cashRevenue + cardRevenue),
      cashOwedByDrivers:     round(cashOwed),
      cardOwedToDrivers:     round(cardOwed),
      cardGross:             round(cardTotal),
      platformFee:           round(platformFee),
      cardDriverShare:       round(cardDriverShare),
      driverExpenses:        round(expenses),
      companyCommissionPct:  round(100 - companyDefaultDriverPct),
      driverCommissionPct:   round(companyDefaultDriverPct),
      platformCommissionPct: round(platformPct * 100),
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

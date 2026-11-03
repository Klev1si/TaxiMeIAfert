/**
 * CompanyFinancesService — per-driver and overall money tracking for a
 * company. Computes from rides + driver_ledger + company_settlements so
 * we don't have to maintain a denormalised state.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { LEGACY_CARD_FEE_PCT, PlatformFeesService } from '../platform-fees/platform-fees.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, Driver, Expense, Ride } from '../entities';
import {
  CompanySettlement,
  SettlementDirection,
} from '../entities/company-settlement.entity';
import { RideStatus } from '../common/enums';



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
  /** Platform's total from this driver's rides (commission + card fee). */
  platformEarning: number;
  /** Platform commission (commission contracts) on this driver's rides. */
  platformCommission: number;
  /** Card fee on this driver's card rides. */
  cardFee:          number;
  /** Company's share from cash rides / card rides (after platform fees). */
  cashCompanyShare: number;
  cardCompanyShare: number;
  /** Driver's share of card rides. */
  cardDriverShare:  number;
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
  /** Card fee the platform kept on card rides (each ride at its own rate). */
  platformFee:        number;
  /** Platform commission owed on all rides (commission contracts). */
  platformCommission: number;
  /** Driver share of card rides (their agreed % of the full fare). */
  cardDriverShare:    number;
  /** Sum of driver-logged expenses (fuel, repairs, etc.) for the period. */
  driverExpenses:     number;
  // ── Percentages so the UI doesn't have to derive them ───────────────────
  /** Company's commission percentage (e.g. 30 in a 70/30 split). */
  companyCommissionPct: number;
  /** Driver's commission percentage (e.g. 70). */
  driverCommissionPct:  number;
  /** Current card fee % (applies to card rides of every contract). */
  platformCommissionPct: number;
  /** The company's contract with the platform. */
  contractType:          'unassigned' | 'subscription' | 'commission';
  /** Platform commission % for commission contracts, else null. */
  contractCommissionPct: number | null;
}

/** Split a driver's aggregated rides: the driver keeps `driverPct` of the
 *  full fare, the platform takes commission + card fee, the company the rest. */
function splitAggregate(
  row: { gross_cash: string; gross_card: string; commission_cash: string; commission_card: string; card_fee: string },
  driverPct: number,
) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const grossCash = Number(row.gross_cash), grossCard = Number(row.gross_card);
  const commCash  = Number(row.commission_cash), commCard = Number(row.commission_card);
  const cardFee   = Number(row.card_fee);
  const cashDriver = grossCash * driverPct / 100;
  const cardDriver = grossCard * driverPct / 100;
  const cashCompany = grossCash - cashDriver - commCash;
  const cardCompany = grossCard - cardDriver - commCard - cardFee;
  return {
    driver:             r2(cashDriver + cardDriver),
    company:            r2(cashCompany + cardCompany),
    platform:           r2(commCash + commCard + cardFee),
    platformCommission: r2(commCash + commCard),
    cardFee:            r2(cardFee),
    cashCompany:        r2(cashCompany),
    cardCompany:        r2(cardCompany),
    cardDriver:         r2(cardDriver),
  };
}

@Injectable()
export class CompanyFinancesService {
  constructor(
    @InjectRepository(Company)            private readonly companyRepo: Repository<Company>,
    @InjectRepository(Driver)             private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Ride)               private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Expense)            private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(CompanySettlement)  private readonly settleRepo: Repository<CompanySettlement>,
    private readonly platformFees: PlatformFeesService,
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
       LEFT JOIN rides r
         ON r.driver_id = d.id
        AND r.status = $1
        AND r.total_fare IS NOT NULL
        ${since ? 'AND r.completed_at >= $3' : ''}
       LEFT JOIN driver_ledger dl
         ON dl.ride_id = r.id
        AND dl.driver_id = d.id
        AND dl.type = 'credit'
       LEFT JOIN platform_credits pc ON pc.ride_id = r.id
       WHERE d.company_id = $2
       GROUP BY d.id, d.first_name, d.last_name, d.vehicle_plate, d.commission_pct_override`,
      since ? [RideStatus.COMPLETED, company.id, since] : [RideStatus.COMPLETED, company.id],
    ) as Array<{
      driverId: string; firstName: string; lastName: string; vehiclePlate: string;
      overridePct: string | null;
      cash_total: string; card_total: string;
      gross_cash: string; gross_card: string;
      commission_cash: string; commission_card: string; card_fee: string;
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

      // The driver always gets their agreed % of the full fare; platform
      // commission and card fee come out of the company's share.
      const split = splitAggregate(row, effectivePct);
      const cashOwed  = cashTotal * companyFrac;                       // driver collected cash, owes company this
      const cardOwed  = Number(row.gross_card) * driverFrac;           // company owes driver this from card
      const driverEarning   = split.driver;
      const companyEarning  = split.company;
      const platformEarning = split.platform;

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
        platformCommission: split.platformCommission,
        cardFee:            split.cardFee,
        cashCompanyShare:   split.cashCompany,
        cardCompanyShare:   split.cardCompany,
        cardDriverShare:    split.cardDriver,
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
    const fees = await this.platformFees.get();

    // Aggregate from the per-driver DTOs so per-driver commission overrides
    // are reflected in the totals.
    let cashTotal = 0, cardTotal = 0, cashOwed = 0, cardOwed = 0, expenses = 0;
    let cashRevenue = 0, cardRevenue = 0, cardDriverShare = 0, cardFee = 0, platformCommission = 0;
    for (const d of drivers) {
      cashTotal += d.cashCollected;
      cardTotal += d.cardTotal;
      cashOwed  += d.cashOwedToCompany;
      cardOwed  += d.cardOwedToDriver;
      expenses  += d.expensesTotal;
      cashRevenue        += d.cashCompanyShare;
      cardRevenue        += d.cardCompanyShare;
      cardDriverShare    += d.cardDriverShare;
      cardFee            += d.cardFee;
      platformCommission += d.platformCommission;
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      cashRevenue:           round(cashRevenue),
      cardRevenue:           round(cardRevenue),
      totalRevenue:          round(cashRevenue + cardRevenue),
      cashOwedByDrivers:     round(cashOwed),
      cardOwedToDrivers:     round(cardOwed),
      cardGross:             round(cardTotal),
      platformFee:           round(cardFee),
      platformCommission:    round(platformCommission),
      cardDriverShare:       round(cardDriverShare),
      driverExpenses:        round(expenses),
      companyCommissionPct:  round(100 - companyDefaultDriverPct),
      driverCommissionPct:   round(companyDefaultDriverPct),
      platformCommissionPct: round(fees.cardFeePct),
      contractType:          company.billingModel ?? 'unassigned',
      contractCommissionPct: company.platformCommissionPct != null ? Number(company.platformCommissionPct) : null,
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

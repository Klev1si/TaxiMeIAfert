import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Company,
  CommissionPayment,
  Driver,
  Ride,
  User,
  type CompanyBillingModel,
} from '../entities/index.js';
import { RideStatus } from '../common/enums/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Company contracts with the platform.
 *
 * The admin agrees a deal with each company and records it here:
 *  - 'subscription' → the company pays a plan (existing subscription flow)
 *  - 'commission'   → the platform takes N % of the gross fare of every ride
 *                     completed by the company's drivers
 *  - 'unassigned'   → no deal yet; drivers can't take rides
 *
 * Commission accounting: when a ride completes for a commission company, the
 * rate in force is snapshotted on the ride (rides.platform_commission_pct), so
 * changing the rate later never rewrites past rides. Gross fare = what the
 * passenger paid plus any platform-funded discount (e.g. the first-ride
 * offer), i.e. the full price of the ride. The company's balance is the
 * commission owed minus payments the admin recorded.
 */

export type BillingPeriod = 'today' | 'week' | 'month' | 'all';

export interface CompanyBillingDto {
  /** Who the contract is with. */
  subject:       'company' | 'driver';
  /** Company id, or driver id for solo drivers. */
  companyId:     string;
  /** Company name, or the driver's full name. */
  companyName:   string;
  billingModel:  CompanyBillingModel;
  commissionPct: number | null;
  setAt:         Date | null;
}

export interface CommissionStatementDto extends CompanyBillingDto {
  period: {
    name:       BillingPeriod;
    rides:      number;
    grossFare:  number;
    commission: number;
  };
  allTime: {
    commission: number;
    /** Commission the platform already kept from card rides it collected
     *  (solo drivers — withheld from their wallet). 0 for companies. */
    withheld:   number;
    paid:       number;
    /** commission − withheld − paid. Positive = they owe the platform. */
    balance:    number;
  };
  payments: Array<{ id: string; amount: number; note: string | null; createdAt: Date }>;
}

export interface AdminCompanyBillingRow extends CompanyBillingDto {
  isApproved:  boolean;
  driverCount: number;
  /** Commission-contract companies only (0 otherwise). */
  commissionOwed: number;
  paid:           number;
  balance:        number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function periodStart(p: BillingPeriod, now = new Date()): Date | null {
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
    default:
      return null;
  }
}

/** Validate an admin's contract choice. Exported for tests. */
export function validateContract(
  model: CompanyBillingModel,
  commissionPct: number | null | undefined,
): { billingModel: CompanyBillingModel; platformCommissionPct: number | null } {
  if (model === 'commission') {
    const pct = Number(commissionPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 50) {
      throw new BadRequestException('Commission must be greater than 0 % and at most 50 %.');
    }
    return { billingModel: model, platformCommissionPct: round2(pct) };
  }
  if (model !== 'subscription' && model !== 'unassigned') {
    throw new BadRequestException('Unknown contract type');
  }
  return { billingModel: model, platformCommissionPct: null };
}

@Injectable()
export class CompanyBillingService {
  constructor(
    @InjectRepository(Company)                  private readonly companyRepo: Repository<Company>,
    @InjectRepository(CommissionPayment) private readonly paymentRepo: Repository<CommissionPayment>,
    @InjectRepository(Ride)                     private readonly rideRepo:    Repository<Ride>,
    @InjectRepository(Driver)                   private readonly driverRepo:  Repository<Driver>,
    @InjectRepository(User)                     private readonly userRepo:    Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Lookups ────────────────────────────────────────────────────────────────

  async companyForUser(userId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { userId } });
    if (!company) throw new NotFoundException('Company profile not found');
    return company;
  }

  private async companyById(companyId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private toDto(c: Company): CompanyBillingDto {
    return {
      subject:       'company',
      companyId:     c.id,
      companyName:   c.name,
      billingModel:  c.billingModel ?? 'unassigned',
      commissionPct: c.platformCommissionPct != null ? Number(c.platformCommissionPct) : null,
      setAt:         c.billingModelSetAt ?? null,
    };
  }

  // ── Admin: set the contract ────────────────────────────────────────────────

  async setContract(
    companyId: string,
    model: CompanyBillingModel,
    commissionPct?: number | null,
  ): Promise<{ before: CompanyBillingDto; after: CompanyBillingDto }> {
    const company = await this.companyById(companyId);
    const before  = this.toDto(company);
    const next    = validateContract(model, commissionPct);

    company.billingModel          = next.billingModel;
    company.platformCommissionPct = next.platformCommissionPct;
    company.billingModelSetAt     = new Date();
    await this.companyRepo.save(company);
    const after = this.toDto(company);

    // Let the company know (push notification; best-effort).
    const user = await this.userRepo.findOne({ where: { id: company.userId }, select: ['id', 'fcmToken'] });
    if (user?.fcmToken && (before.billingModel !== after.billingModel || before.commissionPct !== after.commissionPct)) {
      const body = after.billingModel === 'commission'
        ? `Kontrata juaj: ${after.commissionPct}% e të ardhurave nga udhëtimet.`
        : after.billingModel === 'subscription'
          ? 'Kontrata juaj: abonim. Zgjidhni planin tuaj në aplikacion.'
          : 'Kontrata juaj është në përgatitje.';
      void this.notifications.sendToToken(user.fcmToken, {
        title: 'Kontrata me platformën u përditësua',
        body,
        data: { event: 'company_contract_updated' },
      });
    }
    return { before, after };
  }

  // ── Statements ─────────────────────────────────────────────────────────────

  /**
   * Commission rides of a company: gross fare and commission per ride,
   * summed. `since` = null → all time.
   */
  private async commissionTotals(
    subject: { companyId: string } | { driverId: string },
    since: Date | null,
  ): Promise<{ rides: number; grossFare: number; commission: number; withheld: number }> {
    const isDriver = 'driverId' in subject;
    const params: unknown[] = [isDriver ? subject.driverId : subject.companyId, RideStatus.COMPLETED];
    if (since) params.push(since);
    const [row] = await this.rideRepo.query(
      `SELECT
         COUNT(*)::int AS rides,
         COALESCE(SUM(g.gross), 0)::numeric AS gross,
         COALESCE(SUM(ROUND((g.gross * g.pct / 100)::numeric, 2)), 0)::numeric AS commission,
         COALESCE(SUM(CASE WHEN g.card THEN ROUND((g.gross * g.pct / 100)::numeric, 2) END), 0)::numeric AS withheld
       FROM (
         SELECT r.platform_commission_pct AS pct,
                COALESCE(r.total_fare, 0) + COALESCE(pc.amount, 0) AS gross,
                (dl.payment_method = 'card') AS card
         FROM rides r
         LEFT JOIN platform_credits pc ON pc.ride_id = r.id
         LEFT JOIN driver_ledger dl ON dl.ride_id = r.id AND dl.driver_id = r.driver_id AND dl.type = 'credit'
         WHERE ${isDriver ? 'r.driver_id' : 'r.company_id'} = $1
           AND r.status = $2
           AND r.platform_commission_pct IS NOT NULL
           ${since ? 'AND r.completed_at >= $3' : ''}
       ) g`,
      params,
    ) as Array<{ rides: number; gross: string; commission: string; withheld: string }>;
    return {
      rides:      Number(row?.rides ?? 0),
      grossFare:  round2(Number(row?.gross ?? 0)),
      commission: round2(Number(row?.commission ?? 0)),
      // Only solo drivers have commission withheld from card rides.
      withheld:   isDriver ? round2(Number(row?.withheld ?? 0)) : 0,
    };
  }

  private async paidTotal(subject: { companyId: string } | { driverId: string }): Promise<number> {
    const isDriver = 'driverId' in subject;
    const [row] = await this.paymentRepo.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS paid FROM commission_payments
       WHERE ${isDriver ? 'driver_id' : 'company_id'} = $1`,
      [isDriver ? subject.driverId : subject.companyId],
    ) as Array<{ paid: string }>;
    return round2(Number(row?.paid ?? 0));
  }

  async statement(companyId: string, period: BillingPeriod): Promise<CommissionStatementDto> {
    const company = await this.companyById(companyId);
    const subject = { companyId: company.id };
    const [inPeriod, allTime, paid, payments] = await Promise.all([
      this.commissionTotals(subject, periodStart(period)),
      this.commissionTotals(subject, null),
      this.paidTotal(subject),
      this.paymentRepo.find({
        where: { companyId: company.id },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);
    return {
      ...this.toDto(company),
      period:  { name: period, rides: inPeriod.rides, grossFare: inPeriod.grossFare, commission: inPeriod.commission },
      allTime: { commission: allTime.commission, withheld: 0, paid, balance: round2(allTime.commission - paid) },
      payments: payments.map((p) => ({
        id: p.id, amount: Number(p.amount), note: p.note, createdAt: p.createdAt,
      })),
    };
  }

  async statementForUser(userId: string, period: BillingPeriod): Promise<CommissionStatementDto> {
    const company = await this.companyForUser(userId);
    return this.statement(company.id, period);
  }

  // ── Solo drivers ───────────────────────────────────────────────────────────

  private async soloDriver(driverId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  private driverDto(d: Driver): CompanyBillingDto {
    return {
      subject:       'driver',
      companyId:     d.id,
      companyName:   `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || 'Driver',
      billingModel:  d.billingModel ?? 'subscription',
      commissionPct: d.platformCommissionPct != null ? Number(d.platformCommissionPct) : null,
      setAt:         d.billingModelSetAt ?? null,
    };
  }

  /** Admin: set a SOLO driver's contract ('subscription' or 'commission'). */
  async setDriverContract(
    driverId: string,
    model: CompanyBillingModel,
    commissionPct?: number | null,
  ): Promise<{ before: CompanyBillingDto; after: CompanyBillingDto }> {
    const driver = await this.soloDriver(driverId);
    if (driver.companyId) {
      throw new BadRequestException('This driver works for a company — set the company’s contract instead.');
    }
    if (model === 'unassigned') {
      throw new BadRequestException('Solo drivers are either on a subscription or a commission contract.');
    }
    const before = this.driverDto(driver);
    const next   = validateContract(model, commissionPct);
    driver.billingModel          = next.billingModel as Driver['billingModel'];
    driver.platformCommissionPct = next.platformCommissionPct;
    driver.billingModelSetAt     = new Date();
    await this.driverRepo.save(driver);
    const after = this.driverDto(driver);

    const user = await this.userRepo.findOne({ where: { id: driver.userId }, select: ['id', 'fcmToken'] });
    if (user?.fcmToken && (before.billingModel !== after.billingModel || before.commissionPct !== after.commissionPct)) {
      void this.notifications.sendToToken(user.fcmToken, {
        title: 'Kontrata me platformën u përditësua',
        body: after.billingModel === 'commission'
          ? `Kontrata juaj: ${after.commissionPct}% për udhëtim, pa abonim.`
          : 'Kontrata juaj: abonim. Zgjidhni planin tuaj në aplikacion.',
        data: { event: 'driver_contract_updated' },
      });
    }
    return { before, after };
  }

  async driverStatement(driverId: string, period: BillingPeriod): Promise<CommissionStatementDto> {
    const driver  = await this.soloDriver(driverId);
    const subject = { driverId: driver.id };
    const [inPeriod, allTime, paid, payments] = await Promise.all([
      this.commissionTotals(subject, periodStart(period)),
      this.commissionTotals(subject, null),
      this.paidTotal(subject),
      this.paymentRepo.find({ where: { driverId: driver.id }, order: { createdAt: 'DESC' }, take: 20 }),
    ]);
    return {
      ...this.driverDto(driver),
      period:  { name: period, rides: inPeriod.rides, grossFare: inPeriod.grossFare, commission: inPeriod.commission },
      allTime: {
        commission: allTime.commission,
        withheld:   allTime.withheld,
        paid,
        balance:    round2(allTime.commission - allTime.withheld - paid),
      },
      payments: payments.map((p) => ({ id: p.id, amount: Number(p.amount), note: p.note, createdAt: p.createdAt })),
    };
  }

  async driverStatementForUser(userId: string, period: BillingPeriod): Promise<CommissionStatementDto> {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    return this.driverStatement(driver.id, period);
  }

  async recordDriverPayment(
    driverId: string,
    amount: number,
    note: string | null,
    adminId: string,
  ): Promise<CommissionStatementDto> {
    await this.soloDriver(driverId);
    const rounded = round2(amount);
    if (!(rounded > 0)) throw new BadRequestException('Amount must be greater than 0');
    await this.paymentRepo.save(this.paymentRepo.create({
      driverId, companyId: null, amount: rounded, note: note?.trim() || null, recordedByAdminId: adminId,
    }));
    return this.driverStatement(driverId, 'month');
  }

  // ── Admin: payments & overview ─────────────────────────────────────────────

  async recordPayment(
    companyId: string,
    amount: number,
    note: string | null,
    adminId: string,
  ): Promise<CommissionStatementDto> {
    await this.companyById(companyId);
    const rounded = round2(amount);
    if (!(rounded > 0)) throw new BadRequestException('Amount must be greater than 0');
    await this.paymentRepo.save(this.paymentRepo.create({
      companyId, driverId: null, amount: rounded, note: note?.trim() || null, recordedByAdminId: adminId,
    }));
    return this.statement(companyId, 'month');
  }

  async adminOverview(): Promise<AdminCompanyBillingRow[]> {
    const companies = await this.companyRepo.find({ order: { name: 'ASC' } });
    if (companies.length === 0) return [];

    const ids = companies.map((c) => c.id);
    const [driverCounts, owed, paid] = await Promise.all([
      this.driverRepo.query(
        `SELECT company_id::text AS id, COUNT(*)::int AS n FROM drivers
         WHERE company_id::text = ANY($1) GROUP BY company_id`,
        [ids],
      ) as Promise<Array<{ id: string; n: number }>>,
      this.rideRepo.query(
        `SELECT r.company_id::text AS id,
                COALESCE(SUM(ROUND(((COALESCE(r.total_fare, 0) + COALESCE(pc.amount, 0)) * r.platform_commission_pct / 100)::numeric, 2)), 0)::numeric AS owed
         FROM rides r LEFT JOIN platform_credits pc ON pc.ride_id = r.id
         WHERE r.company_id::text = ANY($1) AND r.status = $2 AND r.platform_commission_pct IS NOT NULL
         GROUP BY r.company_id`,
        [ids, RideStatus.COMPLETED],
      ) as Promise<Array<{ id: string; owed: string }>>,
      this.paymentRepo.query(
        `SELECT company_id::text AS id, COALESCE(SUM(amount), 0)::numeric AS paid
         FROM commission_payments WHERE company_id::text = ANY($1) GROUP BY company_id`,
        [ids],
      ) as Promise<Array<{ id: string; paid: string }>>,
    ]);
    const nDrivers = new Map(driverCounts.map((r) => [r.id, Number(r.n)]));
    const owedBy   = new Map(owed.map((r) => [r.id, Number(r.owed)]));
    const paidBy   = new Map(paid.map((r) => [r.id, Number(r.paid)]));

    return companies.map((c) => {
      const o = round2(owedBy.get(c.id) ?? 0);
      const p = round2(paidBy.get(c.id) ?? 0);
      return {
        ...this.toDto(c),
        isApproved:     c.isApproved,
        driverCount:    nDrivers.get(c.id) ?? 0,
        commissionOwed: o,
        paid:           p,
        balance:        round2(o - p),
      };
    });
  }
}

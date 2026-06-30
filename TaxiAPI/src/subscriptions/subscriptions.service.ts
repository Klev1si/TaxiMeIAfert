import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Company, CompanySubscription,
  Driver, DriverSubscription,
  SubscriptionPlan, User,
} from '../entities/index.js';
import {
  BILLING_PERIOD_DAYS,
  BillingPeriod,
  PaymentMethod,
  SubscriptionStatus,
} from '../common/enums/index.js';
import type { PlanAudience } from '../entities/subscription-plan.entity.js';
import { PayseraService } from '../paysera/paysera.service.js';
import {
  computeSubscriptionState,
  isWorkingAllowed,
  type SubscriptionState,
} from '../common/subscription-state.js';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface SubscribePlanDto {
  planId: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,

    @InjectRepository(CompanySubscription)
    private readonly companySubRepo: Repository<CompanySubscription>,

    @InjectRepository(DriverSubscription)
    private readonly driverSubRepo: Repository<DriverSubscription>,

    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly paysera: PayseraService,
    private readonly configService: ConfigService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  async listPlans(audience: PlanAudience = 'company'): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      where: { isActive: true, targetAudience: audience },
      order: { billingPeriod: 'ASC', price: 'ASC' },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolveCompany(userId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { userId } });
    if (!company) throw new NotFoundException('Company profile not found');
    return company;
  }

  private async resolveDriver(userId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    return driver;
  }

  private periodFromPlan(plan: SubscriptionPlan, from: Date = new Date()) {
    const days = BILLING_PERIOD_DAYS[plan.billingPeriod] ?? 30;
    const start = new Date(from);
    const end = new Date(from);
    end.setDate(end.getDate() + days);
    return { start, end };
  }

  // ── Company ────────────────────────────────────────────────────────────────

  async getMySubscription(userId: string) {
    const company = await this.resolveCompany(userId);
    const sub = await this.companySubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.companyId = :companyId', { companyId: company.id })
      .orderBy('sub.createdAt', 'DESC')
      .getOne();
    return sub
      ? { ...sub, state: computeSubscriptionState(sub) }
      : null;
  }

  async subscribe(userId: string, planId: string): Promise<CompanySubscription> {
    const company = await this.resolveCompany(userId);

    const plan = await this.planRepo.findOne({
      where: { id: planId, isActive: true, targetAudience: 'company' },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found or inactive');

    const existing = await this.companySubRepo.findOne({
      where: { companyId: company.id },
      order: { createdAt: 'DESC' },
    });

    const { start, end } = this.periodFromPlan(plan);

    if (existing && existing.status !== SubscriptionStatus.CANCELLED) {
      if (existing.planId === planId) {
        throw new BadRequestException('Already subscribed to this plan');
      }
      existing.planId = planId;
      existing.currentPeriodStart = start;
      existing.currentPeriodEnd = end;
      await this.companySubRepo.save(existing);
    } else {
      const sub = this.companySubRepo.create({
        companyId: company.id,
        planId,
        status: SubscriptionStatus.TRIALING,
        paymentMethod: PaymentMethod.CARD,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        payseraOrderId: null,
        paidByAdminId: null,
        paidAt: null,
        paymentReference: null,
        cancelledAt: null,
      });
      await this.companySubRepo.save(sub);
    }

    return this.companySubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.companyId = :companyId', { companyId: company.id })
      .orderBy('sub.createdAt', 'DESC')
      .getOne() as Promise<CompanySubscription>;
  }

  async cancel(userId: string): Promise<CompanySubscription> {
    const company = await this.resolveCompany(userId);

    const sub = await this.companySubRepo.findOne({
      where: { companyId: company.id },
      order: { createdAt: 'DESC' },
    });

    if (!sub) throw new NotFoundException('No active subscription found');
    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Subscription is already cancelled');
    }

    sub.status = SubscriptionStatus.CANCELLED;
    sub.cancelledAt = new Date();
    await this.companySubRepo.save(sub);

    return this.companySubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.id = :id', { id: sub.id })
      .getOne() as Promise<CompanySubscription>;
  }

  // ── Driver ─────────────────────────────────────────────────────────────────

  async getMyDriverSubscription(userId: string) {
    const driver = await this.resolveDriver(userId);
    const own = await this.driverSubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.driverId = :driverId', { driverId: driver.id })
      .orderBy('sub.createdAt', 'DESC')
      .getOne();

    // Drivers under a company are covered by the company's subscription —
    // report THAT state so the app shows the right banner.
    const working = await this.getDriverWorkingState(driver.id);

    return {
      subscription:        own,
      state:               working.state,
      coveredBy:           working.coveredBy,
      effectivePeriodEnd:  working.periodEnd,
    };
  }

  async driverSubscribe(userId: string, planId: string): Promise<DriverSubscription> {
    const driver = await this.resolveDriver(userId);

    const plan = await this.planRepo.findOne({
      where: { id: planId, isActive: true, targetAudience: 'driver' },
    });
    if (!plan) throw new NotFoundException('Driver subscription plan not found or inactive');

    const existing = await this.driverSubRepo.findOne({
      where: { driverId: driver.id },
      order: { createdAt: 'DESC' },
    });

    const { start, end } = this.periodFromPlan(plan);

    if (existing && existing.status !== SubscriptionStatus.CANCELLED) {
      if (existing.planId === planId) {
        throw new BadRequestException('Already subscribed to this plan');
      }
      existing.planId = planId;
      existing.currentPeriodStart = start;
      existing.currentPeriodEnd = end;
      await this.driverSubRepo.save(existing);
    } else {
      const sub = this.driverSubRepo.create({
        driverId: driver.id,
        planId,
        status: SubscriptionStatus.TRIALING,
        paymentMethod: PaymentMethod.CARD,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        payseraOrderId: null,
        paidByAdminId: null,
        paidAt: null,
        paymentReference: null,
        cancelledAt: null,
      });
      await this.driverSubRepo.save(sub);
    }

    return this.driverSubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.driverId = :driverId', { driverId: driver.id })
      .orderBy('sub.createdAt', 'DESC')
      .getOne() as Promise<DriverSubscription>;
  }

  async driverCancel(userId: string): Promise<DriverSubscription> {
    const driver = await this.resolveDriver(userId);

    const sub = await this.driverSubRepo.findOne({
      where: { driverId: driver.id },
      order: { createdAt: 'DESC' },
    });

    if (!sub) throw new NotFoundException('No active subscription found');
    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Subscription is already cancelled');
    }

    sub.status = SubscriptionStatus.CANCELLED;
    sub.cancelledAt = new Date();
    await this.driverSubRepo.save(sub);

    return this.driverSubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.id = :id', { id: sub.id })
      .getOne() as Promise<DriverSubscription>;
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  async createPlan(dto: {
    name: string;
    price: number;
    billingPeriod: BillingPeriod;
    maxDrivers: number;
    features: string[];
    targetAudience?: PlanAudience;
  }): Promise<SubscriptionPlan> {
    const plan = this.planRepo.create({
      name:           dto.name,
      price:          dto.price,
      billingPeriod:  dto.billingPeriod,
      maxDrivers:     dto.maxDrivers,
      features:       dto.features ?? [],
      targetAudience: dto.targetAudience ?? 'company',
      isActive:       true,
    });
    return this.planRepo.save(plan);
  }

  async updatePlan(
    planId: string,
    dto: Partial<{
      name: string;
      price: number;
      billingPeriod: BillingPeriod;
      maxDrivers: number;
      features: string[];
      targetAudience: PlanAudience;
      isActive: boolean;
    }>,
  ): Promise<SubscriptionPlan> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  async deactivatePlan(planId: string): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    plan.isActive = false;
    await this.planRepo.save(plan);
  }

  // ── Paysera checkout ───────────────────────────────────────────────────────

  /**
   * Start a card-payment checkout for a driver or company subscription.
   * Creates (or reuses) a PENDING subscription row and returns the Paysera URL.
   */
  async startCardCheckout(
    userId: string,
    planId: string,
    audience: PlanAudience,
  ): Promise<{ url: string; orderId: string; subscriptionId: string }> {
    const plan = await this.planRepo.findOne({
      where: { id: planId, isActive: true, targetAudience: audience },
    });
    if (!plan) throw new NotFoundException('Plan not found or inactive');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const subscriptionId = audience === 'driver'
      ? await this.upsertPendingDriverSub(userId, plan)
      : await this.upsertPendingCompanySub(userId, plan);

    const orderId = `sub_${audience}_${subscriptionId}_${Date.now()}`;

    // Persist orderId so the callback can find this row even if it arrives
    // before the user is redirected back.
    if (audience === 'driver') {
      await this.driverSubRepo.update({ id: subscriptionId }, { payseraOrderId: orderId });
    } else {
      await this.companySubRepo.update({ id: subscriptionId }, { payseraOrderId: orderId });
    }

    const baseUrl  = this.configService.get<string>('PUBLIC_API_URL')      ?? 'http://localhost:3000';
    const returnUrl = this.configService.get<string>('SUBSCRIPTION_RETURN_URL')
      ?? `${baseUrl}/subscriptions/paysera/return`;

    const url = this.paysera.buildPaymentUrl({
      orderId,
      amount:      Math.round(Number(plan.price) * 100),
      currency:    'EUR',
      acceptUrl:   `${returnUrl}?status=accept&subId=${subscriptionId}`,
      cancelUrl:   `${returnUrl}?status=cancel&subId=${subscriptionId}`,
      callbackUrl: `${baseUrl}/subscriptions/paysera/callback`,
      payerEmail:  user.email ?? undefined,
    });

    return { url, orderId, subscriptionId };
  }

  /**
   * Apply a verified Paysera callback. Activates the subscription and extends
   * the period if Paysera reports status='1' (paid).
   */
  async applyPayseraCallback(fields: Record<string, string>): Promise<void> {
    const orderId = fields.orderid;
    const status  = fields.status;
    if (!orderId) throw new BadRequestException('Missing orderid in Paysera callback');

    // status '1' = paid, '2' = additional verification in progress
    if (status !== '1') {
      this.logger.log(`Paysera callback ${orderId}: status=${status} — not activating`);
      return;
    }

    // orderId format: sub_<audience>_<subId>_<ts>
    const [, audience, subId] = orderId.split('_');
    if (audience !== 'driver' && audience !== 'company') {
      throw new BadRequestException('Unrecognised orderid format');
    }

    if (audience === 'driver') {
      const sub = await this.driverSubRepo.findOne({ where: { id: subId }, relations: ['plan'] });
      if (!sub) throw new NotFoundException('Driver subscription not found');
      const { start, end } = this.periodFromPlan(sub.plan);
      sub.status              = SubscriptionStatus.ACTIVE;
      sub.paymentMethod       = PaymentMethod.CARD;
      sub.paidAt              = new Date();
      sub.currentPeriodStart  = start;
      sub.currentPeriodEnd    = end;
      sub.cancelledAt         = null;
      await this.driverSubRepo.save(sub);
      this.logger.log(`Driver sub ${subId} activated via Paysera (${orderId})`);
    } else {
      const sub = await this.companySubRepo.findOne({ where: { id: subId }, relations: ['plan'] });
      if (!sub) throw new NotFoundException('Company subscription not found');
      const { start, end } = this.periodFromPlan(sub.plan);
      sub.status              = SubscriptionStatus.ACTIVE;
      sub.paymentMethod       = PaymentMethod.CARD;
      sub.paidAt              = new Date();
      sub.currentPeriodStart  = start;
      sub.currentPeriodEnd    = end;
      sub.cancelledAt         = null;
      await this.companySubRepo.save(sub);
      this.logger.log(`Company sub ${subId} activated via Paysera (${orderId})`);
    }
  }

  // ── State (active / grace / blocked) ───────────────────────────────────────

  /**
   * Determine a driver's working state.
   * - Drivers in a company are covered by the COMPANY's subscription.
   * - Solo drivers are covered by their OWN driver subscription.
   */
  async getDriverWorkingState(driverId: string): Promise<{
    state: SubscriptionState;
    coveredBy: 'company' | 'driver' | 'none';
    periodEnd: Date | null;
  }> {
    const driver = await this.driverRepo.findOne({
      where: { id: driverId },
      select: ['id', 'companyId'],
    });
    if (!driver) return { state: 'inactive', coveredBy: 'none', periodEnd: null };

    if (driver.companyId) {
      const sub = await this.companySubRepo.findOne({
        where: { companyId: driver.companyId },
        order: { createdAt: 'DESC' },
      });
      return {
        state:     computeSubscriptionState(sub),
        coveredBy: 'company',
        periodEnd: sub?.currentPeriodEnd ?? null,
      };
    }

    const sub = await this.driverSubRepo.findOne({
      where: { driverId: driver.id },
      order: { createdAt: 'DESC' },
    });
    return {
      state:     computeSubscriptionState(sub),
      coveredBy: 'driver',
      periodEnd: sub?.currentPeriodEnd ?? null,
    };
  }

  /** Throws ForbiddenException when the driver's subscription is blocked. */
  async assertDriverCanWork(driverId: string): Promise<void> {
    const { state, coveredBy } = await this.getDriverWorkingState(driverId);
    if (!isWorkingAllowed(state)) {
      const who = coveredBy === 'company' ? 'Your company’s' : 'Your';
      throw new BadRequestException(
        `${who} subscription is ${state}. Renew to continue accepting rides.`,
      );
    }
  }

  // ── Cash payment flow ──────────────────────────────────────────────────────

  /**
   * Subscriber requests to pay in cash. Creates (or reuses) a PENDING
   * subscription with payment_method=cash. Admin must then mark it as paid.
   */
  async startCashRequest(
    userId: string,
    planId: string,
    audience: PlanAudience,
  ): Promise<{ subscriptionId: string }> {
    const plan = await this.planRepo.findOne({
      where: { id: planId, isActive: true, targetAudience: audience },
    });
    if (!plan) throw new NotFoundException('Plan not found or inactive');

    const subscriptionId = audience === 'driver'
      ? await this.upsertPendingDriverSub(userId, plan, PaymentMethod.CASH)
      : await this.upsertPendingCompanySub(userId, plan, PaymentMethod.CASH);

    return { subscriptionId };
  }

  // ── Admin: subscribers listing & cash payment ──────────────────────────────

  /** Internal shape returned by listAllSubscriptions. */
  private toSubRow(
    sub: DriverSubscription | CompanySubscription,
    kind: 'driver' | 'company',
  ) {
    return {
      id:                 sub.id,
      kind,
      planId:             sub.planId,
      plan:               (sub as any).plan ?? null,
      status:             sub.status,
      paymentMethod:      sub.paymentMethod,
      payseraOrderId:     sub.payseraOrderId,
      paidByAdminId:      sub.paidByAdminId,
      paidAt:             sub.paidAt,
      paymentReference:   sub.paymentReference,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd:   sub.currentPeriodEnd,
      cancelledAt:        sub.cancelledAt,
      createdAt:          sub.createdAt,
      updatedAt:          sub.updatedAt,
      subjectId:          kind === 'driver'
        ? (sub as DriverSubscription).driverId
        : (sub as CompanySubscription).companyId,
    };
  }

  /**
   * Analytics snapshot for the admin dashboard.
   * - MRR normalizes every active sub price to a monthly figure
   *   (monthly=price, quarterly=price/3, yearly=price/12).
   * - revenue30d sums actually-paid amounts (paidAt within 30 days).
   * - revenueByMonth gives the last 6 calendar months for a trend chart.
   * - state counts use computeSubscriptionState so grace/blocked match what
   *   the driver actually sees in the app, not the raw status.
   */
  async getAnalytics() {
    const now    = new Date();
    const day    = 24 * 60 * 60 * 1000;
    const cutoff30 = new Date(now.getTime() - 30 * day);
    const cutoff7  = new Date(now.getTime() +  7 * day);
    const monthlyDivisor: Record<BillingPeriod, number> = {
      [BillingPeriod.MONTHLY]:   1,
      [BillingPeriod.QUARTERLY]: 3,
      [BillingPeriod.YEARLY]:    12,
    };

    const [driverSubs, companySubs] = await Promise.all([
      this.driverSubRepo.createQueryBuilder('sub')
        .leftJoinAndSelect('sub.plan', 'plan').getMany(),
      this.companySubRepo.createQueryBuilder('sub')
        .leftJoinAndSelect('sub.plan', 'plan').getMany(),
    ]);

    type AnySub = (DriverSubscription | CompanySubscription) & { plan?: SubscriptionPlan | null };
    const all: Array<{ sub: AnySub; kind: 'driver' | 'company' }> = [
      ...driverSubs.map(s => ({ sub: s as AnySub, kind: 'driver'  as const })),
      ...companySubs.map(s => ({ sub: s as AnySub, kind: 'company' as const })),
    ];

    let mrr = 0;
    const statusCounts:  Record<string, number> = { active: 0, pending: 0, trialing: 0, past_due: 0, cancelled: 0 };
    const stateCounts:   Record<SubscriptionState, number> = { active: 0, grace: 0, blocked: 0, inactive: 0 };
    const audienceCounts            = { driver: 0, company: 0 };
    const paymentMix                = { card: 0, cash: 0 };
    const planMix                   = new Map<string, { planId: string; planName: string; billingPeriod: BillingPeriod; count: number }>();
    let activeCount    = 0;
    let revenue30d     = 0;
    let expiringSoon   = 0;
    const expiringByAudience        = { driver: 0, company: 0 };
    let cancelled30d   = 0;
    const monthBuckets = new Map<string, number>(); // YYYY-MM → paid amount

    for (const { sub, kind } of all) {
      statusCounts[sub.status] = (statusCounts[sub.status] ?? 0) + 1;
      const state = computeSubscriptionState(sub);
      stateCounts[state]++;

      if (sub.status === SubscriptionStatus.ACTIVE) {
        activeCount++;
        audienceCounts[kind]++;
        if (sub.paymentMethod === PaymentMethod.CARD)      paymentMix.card++;
        else if (sub.paymentMethod === PaymentMethod.CASH) paymentMix.cash++;

        if (sub.plan) {
          const priceNum = Number(sub.plan.price) || 0;
          mrr += priceNum / (monthlyDivisor[sub.plan.billingPeriod] ?? 1);

          const key = sub.plan.id;
          const row = planMix.get(key);
          if (row) row.count++;
          else planMix.set(key, {
            planId:        sub.plan.id,
            planName:      `${sub.plan.name} (${kind})`,
            billingPeriod: sub.plan.billingPeriod,
            count:         1,
          });
        }

        const periodEnd = new Date(sub.currentPeriodEnd).getTime();
        if (periodEnd <= cutoff7.getTime() && periodEnd >= now.getTime()) {
          expiringSoon++;
          expiringByAudience[kind]++;
        }
      }

      if (sub.cancelledAt && new Date(sub.cancelledAt).getTime() >= cutoff30.getTime()) {
        cancelled30d++;
      }

      if (sub.paidAt && sub.plan) {
        const paidAt = new Date(sub.paidAt);
        const priceNum = Number(sub.plan.price) || 0;
        if (paidAt.getTime() >= cutoff30.getTime()) revenue30d += priceNum;

        const monthKey = `${paidAt.getUTCFullYear()}-${String(paidAt.getUTCMonth() + 1).padStart(2, '0')}`;
        monthBuckets.set(monthKey, (monthBuckets.get(monthKey) ?? 0) + priceNum);
      }
    }

    // Build last-6-months trend (oldest first, zero-fill missing months)
    const revenueByMonth: Array<{ month: string; revenue: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      revenueByMonth.push({ month: key, revenue: Math.round((monthBuckets.get(key) ?? 0) * 100) / 100 });
    }

    // Churn = cancelled-in-window / (active + cancelled-in-window)
    const churnDenom = activeCount + cancelled30d;
    const churnRate  = churnDenom > 0 ? cancelled30d / churnDenom : 0;

    return {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      activeCount,
      audienceCounts,
      statusCounts,
      stateCounts,
      paymentMix,
      planMix: Array.from(planMix.values()).sort((a, b) => b.count - a.count),
      revenue30d:    Math.round(revenue30d * 100) / 100,
      revenueByMonth,
      expiringSoon,
      expiringByAudience,
      cancelled30d,
      churnRate30d: Math.round(churnRate * 10000) / 100, // percentage with 2 decimals
      generatedAt: now.toISOString(),
    };
  }

  async listAllSubscriptions(opts: {
    audience?:        PlanAudience;
    status?:          SubscriptionStatus;
    paymentMethod?:   PaymentMethod;
    expiringInDays?:  number;
    page?:            number;
    limit?:           number;
  }) {
    const page  = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip  = (page - 1) * limit;

    const buildQuery = (kind: 'driver' | 'company') => {
      const repo = kind === 'driver' ? this.driverSubRepo : this.companySubRepo;
      const qb = repo.createQueryBuilder('sub').leftJoinAndSelect('sub.plan', 'plan');
      if (opts.status)        qb.andWhere('sub.status = :status', { status: opts.status });
      if (opts.paymentMethod) qb.andWhere('sub.paymentMethod = :pm', { pm: opts.paymentMethod });
      if (opts.expiringInDays != null) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + opts.expiringInDays);
        qb.andWhere('sub.currentPeriodEnd <= :cutoff', { cutoff });
      }
      qb.orderBy('sub.currentPeriodEnd', 'ASC');
      return qb;
    };

    const wantBoth = !opts.audience;
    const rows: ReturnType<typeof this.toSubRow>[] = [];
    let total = 0;

    if (wantBoth || opts.audience === 'driver') {
      const [items, count] = await buildQuery('driver').skip(skip).take(limit).getManyAndCount();
      rows.push(...items.map((s) => this.toSubRow(s, 'driver')));
      total += count;
    }
    if (wantBoth || opts.audience === 'company') {
      const [items, count] = await buildQuery('company').skip(skip).take(limit).getManyAndCount();
      rows.push(...items.map((s) => this.toSubRow(s, 'company')));
      total += count;
    }

    // Re-sort the merged set by period end when both audiences are returned
    rows.sort((a, b) =>
      new Date(a.currentPeriodEnd).getTime() - new Date(b.currentPeriodEnd).getTime(),
    );

    return { rows, total, page, limit };
  }

  async getSubscription(audience: PlanAudience, id: string) {
    if (audience === 'driver') {
      const sub = await this.driverSubRepo.findOne({
        where: { id }, relations: ['plan', 'driver'],
      });
      if (!sub) throw new NotFoundException('Subscription not found');
      return this.toSubRow(sub, 'driver');
    }
    const sub = await this.companySubRepo.findOne({
      where: { id }, relations: ['plan', 'company'],
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.toSubRow(sub, 'company');
  }

  /**
   * Mark a subscription as paid (typically cash, admin-confirmed).
   * Activates the row, sets paid metadata, optionally switches plan, and
   * resets the billing window. If `newPeriodEnd` is omitted, the period is
   * derived from the (possibly newly assigned) plan.
   */
  async markSubscriptionPaid(
    adminId: string,
    audience: PlanAudience,
    id: string,
    opts: {
      newPlanId?:         string;
      newPeriodEnd?:      Date;
      paymentReference?:  string;
    } = {},
  ) {
    const now = new Date();

    if (audience === 'driver') {
      const sub = await this.driverSubRepo.findOne({ where: { id }, relations: ['plan'] });
      if (!sub) throw new NotFoundException('Subscription not found');
      let plan = sub.plan;
      if (opts.newPlanId && opts.newPlanId !== sub.planId) {
        const next = await this.planRepo.findOne({
          where: { id: opts.newPlanId, targetAudience: audience },
        });
        if (!next) throw new NotFoundException('New plan not found for this audience');
        plan = next;
        sub.planId = next.id;
      }
      const { start, end } = this.periodFromPlan(plan, now);
      sub.status              = SubscriptionStatus.ACTIVE;
      sub.paymentMethod       = PaymentMethod.CASH;
      sub.paidByAdminId       = adminId;
      sub.paidAt              = now;
      sub.paymentReference    = opts.paymentReference ?? sub.paymentReference;
      sub.currentPeriodStart  = start;
      sub.currentPeriodEnd    = opts.newPeriodEnd ?? end;
      sub.cancelledAt         = null;
      await this.driverSubRepo.save(sub);
    } else {
      const sub = await this.companySubRepo.findOne({ where: { id }, relations: ['plan'] });
      if (!sub) throw new NotFoundException('Subscription not found');
      let plan = sub.plan;
      if (opts.newPlanId && opts.newPlanId !== sub.planId) {
        const next = await this.planRepo.findOne({
          where: { id: opts.newPlanId, targetAudience: audience },
        });
        if (!next) throw new NotFoundException('New plan not found for this audience');
        plan = next;
        sub.planId = next.id;
      }
      const { start, end } = this.periodFromPlan(plan, now);
      sub.status              = SubscriptionStatus.ACTIVE;
      sub.paymentMethod       = PaymentMethod.CASH;
      sub.paidByAdminId       = adminId;
      sub.paidAt              = now;
      sub.paymentReference    = opts.paymentReference ?? sub.paymentReference;
      sub.currentPeriodStart  = start;
      sub.currentPeriodEnd    = opts.newPeriodEnd ?? end;
      sub.cancelledAt         = null;
      await this.companySubRepo.save(sub);
    }

    return this.getSubscription(audience, id);
  }

  /**
   * Admin override — change plan and/or extend the current period without
   * marking a new payment (e.g. to grant a complimentary extension).
   */
  async adminUpdateSubscription(
    audience: PlanAudience,
    id: string,
    opts: { newPlanId?: string; newPeriodEnd?: Date },
  ) {
    if (audience === 'driver') {
      const sub = await this.driverSubRepo.findOne({ where: { id } });
      if (!sub) throw new NotFoundException('Subscription not found');
      if (opts.newPlanId) {
        const plan = await this.planRepo.findOne({
          where: { id: opts.newPlanId, targetAudience: audience },
        });
        if (!plan) throw new NotFoundException('Plan not found for this audience');
        sub.planId = plan.id;
      }
      if (opts.newPeriodEnd) sub.currentPeriodEnd = opts.newPeriodEnd;
      await this.driverSubRepo.save(sub);
    } else {
      const sub = await this.companySubRepo.findOne({ where: { id } });
      if (!sub) throw new NotFoundException('Subscription not found');
      if (opts.newPlanId) {
        const plan = await this.planRepo.findOne({
          where: { id: opts.newPlanId, targetAudience: audience },
        });
        if (!plan) throw new NotFoundException('Plan not found for this audience');
        sub.planId = plan.id;
      }
      if (opts.newPeriodEnd) sub.currentPeriodEnd = opts.newPeriodEnd;
      await this.companySubRepo.save(sub);
    }
    return this.getSubscription(audience, id);
  }

  private async upsertPendingDriverSub(
    userId: string,
    plan: SubscriptionPlan,
    paymentMethod: PaymentMethod = PaymentMethod.CARD,
  ): Promise<string> {
    const driver = await this.resolveDriver(userId);
    const existing = await this.driverSubRepo.findOne({
      where: { driverId: driver.id },
      order: { createdAt: 'DESC' },
    });
    const { start, end } = this.periodFromPlan(plan);

    if (existing && existing.status !== SubscriptionStatus.CANCELLED) {
      existing.planId             = plan.id;
      existing.status             = SubscriptionStatus.PENDING;
      existing.paymentMethod      = paymentMethod;
      existing.currentPeriodStart = start;
      existing.currentPeriodEnd   = end;
      await this.driverSubRepo.save(existing);
      return existing.id;
    }

    const sub = this.driverSubRepo.create({
      driverId:           driver.id,
      planId:             plan.id,
      status:             SubscriptionStatus.PENDING,
      paymentMethod,
      currentPeriodStart: start,
      currentPeriodEnd:   end,
      payseraOrderId:     null,
      paidByAdminId:      null,
      paidAt:             null,
      paymentReference:   null,
      cancelledAt:        null,
    });
    const saved = await this.driverSubRepo.save(sub);
    return saved.id;
  }

  private async upsertPendingCompanySub(
    userId: string,
    plan: SubscriptionPlan,
    paymentMethod: PaymentMethod = PaymentMethod.CARD,
  ): Promise<string> {
    const company = await this.resolveCompany(userId);
    const existing = await this.companySubRepo.findOne({
      where: { companyId: company.id },
      order: { createdAt: 'DESC' },
    });
    const { start, end } = this.periodFromPlan(plan);

    if (existing && existing.status !== SubscriptionStatus.CANCELLED) {
      existing.planId             = plan.id;
      existing.status             = SubscriptionStatus.PENDING;
      existing.paymentMethod      = paymentMethod;
      existing.currentPeriodStart = start;
      existing.currentPeriodEnd   = end;
      await this.companySubRepo.save(existing);
      return existing.id;
    }

    const sub = this.companySubRepo.create({
      companyId:          company.id,
      planId:             plan.id,
      status:             SubscriptionStatus.PENDING,
      paymentMethod,
      currentPeriodStart: start,
      currentPeriodEnd:   end,
      payseraOrderId:     null,
      paidByAdminId:      null,
      paidAt:             null,
      paymentReference:   null,
      cancelledAt:        null,
    });
    const saved = await this.companySubRepo.save(sub);
    return saved.id;
  }
}

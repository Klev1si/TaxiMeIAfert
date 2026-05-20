import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Company, CompanySubscription,
  Driver, DriverSubscription,
  SubscriptionPlan,
} from '../entities/index.js';
import { SubscriptionStatus } from '../common/enums/index.js';
import type { PlanAudience } from '../entities/subscription-plan.entity.js';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface SubscribePlanDto {
  planId: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SubscriptionsService {
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
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  /**
   * List active plans, optionally filtered by audience.
   * Defaults to 'company' for backward compatibility.
   */
  async listPlans(audience: PlanAudience = 'company'): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      where: { isActive: true, targetAudience: audience },
      order: { priceMonthly: 'ASC' },
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

  private makePeriod() {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);
    return { now, periodEnd };
  }

  // ── Company ────────────────────────────────────────────────────────────────

  async getMySubscription(userId: string): Promise<CompanySubscription | null> {
    const company = await this.resolveCompany(userId);
    return this.companySubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.companyId = :companyId', { companyId: company.id })
      .orderBy('sub.createdAt', 'DESC')
      .getOne();
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

    const { now, periodEnd } = this.makePeriod();

    if (existing && existing.status !== SubscriptionStatus.CANCELLED) {
      if (existing.planId === planId) {
        throw new BadRequestException('Already subscribed to this plan');
      }
      existing.planId = planId;
      existing.currentPeriodStart = now;
      existing.currentPeriodEnd = periodEnd;
      await this.companySubRepo.save(existing);
    } else {
      const sub = this.companySubRepo.create({
        companyId: company.id,
        planId,
        status: SubscriptionStatus.TRIALING,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        stripeSubscriptionId: null,
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

  async getMyDriverSubscription(userId: string): Promise<DriverSubscription | null> {
    const driver = await this.resolveDriver(userId);
    return this.driverSubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.driverId = :driverId', { driverId: driver.id })
      .orderBy('sub.createdAt', 'DESC')
      .getOne();
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

    const { now, periodEnd } = this.makePeriod();

    if (existing && existing.status !== SubscriptionStatus.CANCELLED) {
      if (existing.planId === planId) {
        throw new BadRequestException('Already subscribed to this plan');
      }
      existing.planId = planId;
      existing.currentPeriodStart = now;
      existing.currentPeriodEnd = periodEnd;
      await this.driverSubRepo.save(existing);
    } else {
      const sub = this.driverSubRepo.create({
        driverId: driver.id,
        planId,
        status: SubscriptionStatus.TRIALING,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        stripeSubscriptionId: null,
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
    priceMonthly: number;
    maxDrivers: number;
    features: string[];
    targetAudience?: PlanAudience;
    stripePriceId?: string;
  }): Promise<SubscriptionPlan> {
    const plan = this.planRepo.create({
      name:           dto.name,
      priceMonthly:   dto.priceMonthly,
      maxDrivers:     dto.maxDrivers,
      features:       dto.features ?? [],
      targetAudience: dto.targetAudience ?? 'company',
      stripePriceId:  dto.stripePriceId ?? null,
      isActive:       true,
    });
    return this.planRepo.save(plan);
  }

  async updatePlan(
    planId: string,
    dto: Partial<{
      name: string;
      priceMonthly: number;
      maxDrivers: number;
      features: string[];
      targetAudience: PlanAudience;
      stripePriceId: string | null;
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
}

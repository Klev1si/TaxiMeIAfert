import {
  Controller, Get, Post, Patch, Delete,
  Body, Query, Param, Request, UseGuards,
  ParseIntPipe, DefaultValuePipe,
  HttpCode, HttpStatus, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import {
  IsOptional, IsString, MaxLength, IsNumber, IsBoolean,
  IsNotEmpty, IsInt, Min, Max, IsEnum, IsDateString, IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { AdminService } from './admin.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import { FraudService } from '../fraud/fraud.service';
import type { FraudEventType } from '../entities/fraud-event.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, RideStatus, VehicleType, BillingPeriod, PaymentMethod, SubscriptionStatus } from '../common/enums';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { PlanAudience } from '../entities/subscription-plan.entity';
import { PromoCode, SubscriptionPlan, Tariff, User } from '../entities';
import { PromoDiscountType } from '../entities/promo-code.entity';
import { IsArray, IsUUID } from 'class-validator';

// ── DTOs ──────────────────────────────────────────────────────────────���───────

class CreatePayoutDto {
  @IsNumber() @IsPositive() @Type(() => Number)
  amount: number;

  @IsString() @IsOptional() @MaxLength(300)
  note?: string;
}

class RejectDriverDto {
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

class CreateGlobalTariffDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  name: string;

  @IsNumber() @Min(0) @Type(() => Number)
  baseFare: number;

  @IsNumber() @Min(0) @Type(() => Number)
  perKmRate: number;

  @IsNumber() @Min(0) @Type(() => Number)
  perMinuteRate: number;

  @IsNumber() @Min(0) @Type(() => Number)
  minimumFare: number;

  /** Surge multiplier: 1.00 = no surge, 2.00 = double fare. Defaults to 1.00. */
  @IsNumber() @Min(1) @Max(10) @IsOptional() @Type(() => Number)
  surgeMultiplier?: number;

  @IsBoolean() @IsOptional()
  isNightTariff?: boolean;

  @IsInt() @Min(0) @Max(23) @IsOptional() @Type(() => Number)
  nightStartHour?: number;

  @IsInt() @Min(0) @Max(23) @IsOptional() @Type(() => Number)
  nightEndHour?: number;

  /** Vehicle type this tariff applies to. Null/omit = applies to all types. */
  @IsEnum(VehicleType) @IsOptional()
  vehicleType?: VehicleType;
}

class UpdateGlobalTariffDto {
  @IsString() @IsNotEmpty() @MaxLength(80) @IsOptional()
  name?: string;

  @IsNumber() @Min(0) @Type(() => Number) @IsOptional()
  baseFare?: number;

  @IsNumber() @Min(0) @Type(() => Number) @IsOptional()
  perKmRate?: number;

  @IsNumber() @Min(0) @Type(() => Number) @IsOptional()
  perMinuteRate?: number;

  @IsNumber() @Min(0) @Type(() => Number) @IsOptional()
  minimumFare?: number;

  /** Surge multiplier: 1.00 = no surge, 2.00 = double fare. */
  @IsNumber() @Min(1) @Max(10) @IsOptional() @Type(() => Number)
  surgeMultiplier?: number;

  @IsBoolean() @IsOptional()
  isNightTariff?: boolean;

  @IsInt() @Min(0) @Max(23) @IsOptional() @Type(() => Number)
  nightStartHour?: number;

  @IsInt() @Min(0) @Max(23) @IsOptional() @Type(() => Number)
  nightEndHour?: number;

  /** Vehicle type this tariff applies to. Null = applies to all types. */
  @IsEnum(VehicleType) @IsOptional()
  vehicleType?: VehicleType | null;
}

// ── Subscription Plan DTOs ────────────────────────────────────────────────────

class CreatePlanDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  name: string;

  @IsNumber() @Min(0) @Type(() => Number)
  price: number;

  @IsEnum(BillingPeriod)
  billingPeriod: BillingPeriod;

  @IsInt() @Min(1) @Type(() => Number)
  maxDrivers: number;

  @IsArray() @IsString({ each: true }) @IsOptional()
  features?: string[];

  /** 'company' (default) or 'driver' */
  @IsString() @IsOptional()
  targetAudience?: 'company' | 'driver';
}

class UpdatePlanDto {
  @IsString() @IsNotEmpty() @MaxLength(80) @IsOptional()
  name?: string;

  @IsNumber() @Min(0) @Type(() => Number) @IsOptional()
  price?: number;

  @IsEnum(BillingPeriod) @IsOptional()
  billingPeriod?: BillingPeriod;

  @IsInt() @Min(1) @Type(() => Number) @IsOptional()
  maxDrivers?: number;

  @IsArray() @IsString({ each: true }) @IsOptional()
  features?: string[];

  @IsString() @IsOptional()
  targetAudience?: 'company' | 'driver';

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

// ── Subscription admin DTOs ───────────────────────────────────────────────────

class MarkPaidDto {
  @IsUUID() @IsOptional()
  newPlanId?: string;

  /** ISO-8601 string. If omitted, period is derived from the (new) plan length. */
  @IsDateString() @IsOptional()
  newPeriodEnd?: string;

  @IsString() @IsOptional() @MaxLength(200)
  paymentReference?: string;
}

class UpdateSubscriptionDto {
  @IsUUID() @IsOptional()
  newPlanId?: string;

  @IsDateString() @IsOptional()
  newPeriodEnd?: string;
}

// ── Promo Code DTOs ────────────────────────────────────────────────────────────

class CreatePromoDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  code: string;

  @IsString() @IsOptional() @MaxLength(200)
  description?: string;

  @IsEnum(PromoDiscountType)
  discountType: PromoDiscountType;

  @IsNumber() @Min(0) @Type(() => Number)
  discountValue: number;

  /** For percent codes: cap the maximum discount amount. */
  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  maxDiscountAmount?: number;

  /** Minimum fare to be eligible. */
  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  minimumFare?: number;

  /** NULL = unlimited uses. */
  @IsInt() @Min(1) @IsOptional() @Type(() => Number)
  maxUses?: number;

  /** ISO-8601 expiry date. NULL = never expires. */
  @IsDateString() @IsOptional()
  expiresAt?: string;
}

class UpdatePromoDto {
  @IsString() @IsNotEmpty() @MaxLength(50) @IsOptional()
  code?: string;

  @IsString() @IsOptional() @MaxLength(200)
  description?: string;

  @IsEnum(PromoDiscountType) @IsOptional()
  discountType?: PromoDiscountType;

  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  discountValue?: number;

  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  maxDiscountAmount?: number;

  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  minimumFare?: number;

  @IsInt() @Min(1) @IsOptional() @Type(() => Number)
  maxUses?: number;

  @IsDateString() @IsOptional()
  expiresAt?: string;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
    private readonly walletService: WalletService,
    private readonly fraudService: FraudService,
    private readonly subscriptionsService: SubscriptionsService,
    @InjectRepository(Tariff) private readonly tariffRepo: Repository<Tariff>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(PromoCode) private readonly promoRepo: Repository<PromoCode>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // GET /admin/stats
  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  // GET /admin/metrics  — observability snapshot
  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  // GET /admin/fraud/events?page=1&limit=20&type=&userId=&driverId=
  @Get('fraud/events')
  getFraudEvents(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type')     type?:     FraudEventType,
    @Query('userId')   userId?:   string,
    @Query('driverId') driverId?: string,
  ) {
    return this.fraudService.getEvents({
      page, limit: Math.min(limit, 100),
      type, userId, driverId,
    });
  }

  // GET /admin/drivers?filter=all|pending|approved&page=1&limit=20&search=
  @Get('drivers')
  getDrivers(
    @Query('filter') filter: 'all' | 'pending' | 'approved' = 'all',
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getDrivers(filter, page, limit, search);
  }

  // PATCH /admin/drivers/:id/approve
  @Patch('drivers/:id/approve')
  async approveDriver(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const phone = await this.getAdminPhone(req.user.id);
    return this.adminService.approveDriver(req.user.id, phone, id);
  }

  // PATCH /admin/drivers/:id/reject
  @Patch('drivers/:id/reject')
  async rejectDriver(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: RejectDriverDto,
  ) {
    const phone = await this.getAdminPhone(req.user.id);
    return this.adminService.rejectDriver(req.user.id, phone, id, dto.reason);
  }

  // GET /admin/clients?page=1&limit=20&search=
  @Get('clients')
  getClients(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getClients(page, limit, search);
  }

  // GET /admin/clients/:id — full detail for one passenger
  @Get('clients/:id')
  getClientDetail(@Param('id') id: string) {
    return this.adminService.getClientDetail(id);
  }

  // GET /admin/companies?filter=all|pending|approved&page=1&limit=20
  @Get('companies')
  getCompanies(
    @Query('filter') filter: 'all' | 'pending' | 'approved' = 'all',
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getCompanies(filter, page, limit);
  }

  // PATCH /admin/companies/:id/approve
  @Patch('companies/:id/approve')
  async approveCompany(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const phone = await this.getAdminPhone(req.user.id);
    return this.adminService.approveCompany(req.user.id, phone, id);
  }

  // PATCH /admin/companies/:id/reject
  @Patch('companies/:id/reject')
  async rejectCompany(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const phone = await this.getAdminPhone(req.user.id);
    return this.adminService.rejectCompany(req.user.id, phone, id);
  }

  // GET /admin/analytics?days=7|30
  @Get('analytics')
  getAnalytics(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.adminService.getAnalytics(Math.min(days, 90)); // cap at 90 days
  }

  // GET /admin/live-drivers — all currently online drivers with GPS
  @Get('live-drivers')
  getLiveDrivers() {
    return this.adminService.getLiveDrivers();
  }

  // GET /admin/rides?status=all&page=1&limit=20
  @Get('rides')
  getRides(
    @Query('status') status: RideStatus | 'all' = 'all',
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getRides(status, page, limit);
  }

  // ── Dispatch config ───────────────────────────────────────────────────────

  /**
   * GET /admin/dispatch/config
   * Returns the currently active dispatch-ranking weights (read from env vars).
   * Useful for auditing without server access.
   */
  @Get('dispatch/config')
  getDispatchConfig() {
    return {
      weights: {
        distance:         Number(process.env.DISPATCH_W_DISTANCE   ?? 0.50),
        rating:           Number(process.env.DISPATCH_W_RATING     ?? 0.25),
        acceptanceRate:   Number(process.env.DISPATCH_W_ACCEPTANCE ?? 0.15),
        experience:       Number(process.env.DISPATCH_W_EXPERIENCE ?? 0.10),
      },
      newDriverAcceptScore: Number(process.env.DISPATCH_NEW_DRIVER_ACCEPT_SCORE ?? 0.70),
      notes: {
        distance:        'Normalized: 1.0 = closest candidate, 0.0 = furthest',
        rating:          'driver.rating / 5.0',
        acceptanceRate:  'totalAccepted / (totalAccepted + totalDeclined); newDriverAcceptScore when no history',
        experience:      'min(totalRides, 100) / 100',
      },
    };
  }

  // ── Audit Logs ────────────────────────────────────────────────────────────

  /**
   * GET /admin/audit-logs
   * Optional query params: page, limit, adminId, action, targetType, from, to
   */
  @Get('audit-logs')
  getAuditLogs(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('adminId')    adminId?:    string,
    @Query('action')     action?:     string,
    @Query('targetType') targetType?: string,
    @Query('from')       from?:       string,
    @Query('to')         to?:         string,
  ) {
    return this.auditService.getLogs({
      page,
      limit: Math.min(limit, 200),
      adminId,
      action,
      targetType,
      from: from ? new Date(from) : undefined,
      to:   to   ? new Date(to)   : undefined,
    });
  }

  // ── Global (platform-wide) tariffs ────────────────────────────────────────
  // These tariffs have companyId = NULL and are applied to rides by
  // individual/solo drivers who are not associated with any company.

  /** GET /admin/tariffs */
  @Get('tariffs')
  async getGlobalTariffs() {
    const tariffs = await this.tariffRepo.find({
      where: { companyId: IsNull() },
      order: { createdAt: 'ASC' },
    });
    return tariffs.map(t => this.mapTariff(t));
  }

  /** POST /admin/tariffs */
  @Post('tariffs')
  async createGlobalTariff(@Body() dto: CreateGlobalTariffDto) {
    const tariff = this.tariffRepo.create({
      companyId:       null,
      name:            dto.name,
      baseFare:        dto.baseFare,
      perKmRate:       dto.perKmRate,
      perMinuteRate:   dto.perMinuteRate,
      minimumFare:     dto.minimumFare,
      surgeMultiplier: dto.surgeMultiplier ?? 1.00,
      isNightTariff:   dto.isNightTariff  ?? false,
      nightStartHour:  dto.nightStartHour ?? null,
      nightEndHour:    dto.nightEndHour   ?? null,
      vehicleType:     dto.vehicleType    ?? null,
      isActive:        true,
    });
    await this.tariffRepo.save(tariff);
    return this.mapTariff(tariff);
  }

  /** PATCH /admin/tariffs/:id */
  @Patch('tariffs/:id')
  async updateGlobalTariff(
    @Param('id') id: string,
    @Body() dto: UpdateGlobalTariffDto,
  ) {
    const tariff = await this.tariffRepo.findOne({ where: { id } });
    if (!tariff)               throw new NotFoundException('Tariff not found');
    if (tariff.companyId !== null) throw new ForbiddenException('Not a global tariff');

    if (dto.name            !== undefined) tariff.name            = dto.name;
    if (dto.baseFare        !== undefined) tariff.baseFare        = dto.baseFare;
    if (dto.perKmRate       !== undefined) tariff.perKmRate       = dto.perKmRate;
    if (dto.perMinuteRate   !== undefined) tariff.perMinuteRate   = dto.perMinuteRate;
    if (dto.minimumFare     !== undefined) tariff.minimumFare     = dto.minimumFare;
    if (dto.surgeMultiplier !== undefined) tariff.surgeMultiplier = dto.surgeMultiplier;
    if (dto.isNightTariff   !== undefined) tariff.isNightTariff   = dto.isNightTariff;
    if (dto.nightStartHour  !== undefined) tariff.nightStartHour  = dto.nightStartHour ?? null;
    if (dto.nightEndHour    !== undefined) tariff.nightEndHour    = dto.nightEndHour   ?? null;
    if (dto.vehicleType     !== undefined) tariff.vehicleType     = dto.vehicleType    ?? null;

    await this.tariffRepo.save(tariff);
    return this.mapTariff(tariff);
  }

  /** DELETE /admin/tariffs/:id — soft-deactivate */
  @Delete('tariffs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateGlobalTariff(@Param('id') id: string): Promise<void> {
    const tariff = await this.tariffRepo.findOne({ where: { id } });
    if (!tariff)               throw new NotFoundException('Tariff not found');
    if (tariff.companyId !== null) throw new ForbiddenException('Not a global tariff');
    await this.tariffRepo.update(id, { isActive: false });
  }

  // ── Driver Wallet / Payouts ────────────────────────────────────────────────

  /**
   * GET /admin/wallet/balances?page=1&limit=20&all=false
   * Lists all drivers with an outstanding balance (or all if ?all=true).
   */
  @Get('wallet/balances')
  getWalletBalances(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('all') showAll?: string,
  ) {
    const nonZeroOnly = showAll !== 'true';
    return this.walletService.getAllBalances(page, Math.min(limit, 100), nonZeroOnly);
  }

  /**
   * GET /admin/drivers/:driverId/wallet
   * Returns a driver's full wallet (balance + last 100 entries).
   */
  @Get('drivers/:driverId/wallet')
  getDriverWallet(@Param('driverId') driverId: string) {
    return this.walletService.getDriverWallet(driverId);
  }

  /**
   * POST /admin/drivers/:driverId/payout
   * Records a payout debit for a driver.  Amount must not exceed current balance.
   */
  @Post('drivers/:driverId/payout')
  @HttpCode(HttpStatus.CREATED)
  async createPayout(
    @Request() req: { user: { id: string } },
    @Param('driverId') driverId: string,
    @Body() dto: CreatePayoutDto,
  ) {
    const result = await this.walletService.createPayout(driverId, dto.amount, dto.note);

    void this.auditService.log({
      adminId:    req.user.id,
      action:     'wallet.payout',
      targetType: 'driver',
      targetId:   driverId,
      metadata:   { amount: dto.amount, note: dto.note ?? null },
    });

    return result;
  }

  /** Fetch the admin's phone for audit log records (best-effort, never throws). */
  private async getAdminPhone(adminUserId: string): Promise<string | null> {
    try {
      const user = await this.userRepo.findOne({
        where: { id: adminUserId },
        select: ['phone'],
      });
      return user?.phone ?? null;
    } catch {
      return null;
    }
  }

  private mapTariff(t: Tariff) {
    return {
      id:              t.id,
      name:            t.name,
      baseFare:        Number(t.baseFare),
      perKmRate:       Number(t.perKmRate),
      perMinuteRate:   Number(t.perMinuteRate),
      minimumFare:     Number(t.minimumFare),
      surgeMultiplier: Number(t.surgeMultiplier ?? 1),
      vehicleType:     t.vehicleType,
      isNightTariff:   t.isNightTariff,
      nightStartHour:  t.nightStartHour,
      nightEndHour:    t.nightEndHour,
      isActive:        t.isActive,
      createdAt:       t.createdAt,
    };
  }

  // ── Subscription Plan Management ───────────────────────────────────────────

  /** GET /admin/plans — list all plans (active and inactive) */
  @Get('plans')
  listPlans() {
    return this.planRepo.find({
      order: { targetAudience: 'ASC', billingPeriod: 'ASC', price: 'ASC' },
    });
  }

  /** POST /admin/plans — create a new plan */
  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  async createPlan(@Body() dto: CreatePlanDto) {
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

  /** PATCH /admin/plans/:id — update plan fields */
  @Patch('plans/:id')
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (dto.name           !== undefined) plan.name           = dto.name;
    if (dto.price          !== undefined) plan.price          = dto.price;
    if (dto.billingPeriod  !== undefined) plan.billingPeriod  = dto.billingPeriod;
    if (dto.maxDrivers     !== undefined) plan.maxDrivers     = dto.maxDrivers;
    if (dto.features       !== undefined) plan.features       = dto.features;
    if (dto.targetAudience !== undefined) plan.targetAudience = dto.targetAudience;
    if (dto.isActive       !== undefined) plan.isActive       = dto.isActive;
    return this.planRepo.save(plan);
  }

  /** DELETE /admin/plans/:id — soft-deactivate */
  @Delete('plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivatePlan(@Param('id') id: string): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.planRepo.update(id, { isActive: false });
  }

  // ── Subscriber management ──────────────────────────────────────────────────

  /**
   * GET /admin/subscriptions
   *   ?audience=driver|company
   *   &status=active|pending|past_due|cancelled|trialing
   *   &paymentMethod=card|cash
   *   &expiringInDays=7
   *   &page=1&limit=20
   */
  @Get('subscriptions')
  listSubscriptions(
    @Query('audience')        audience?: PlanAudience,
    @Query('status')          status?: SubscriptionStatus,
    @Query('paymentMethod')   paymentMethod?: PaymentMethod,
    @Query('expiringInDays')  expiringInDays?: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return this.subscriptionsService.listAllSubscriptions({
      audience:       audience === 'driver' || audience === 'company' ? audience : undefined,
      status,
      paymentMethod,
      expiringInDays: expiringInDays != null ? Number(expiringInDays) : undefined,
      page, limit,
    });
  }

  /**
   * GET /admin/subscriptions/analytics
   * Snapshot for the admin dashboard: MRR/ARR, status & state counts,
   * payment & plan mix, 6-month revenue trend, expiring-soon, churn.
   */
  @Get('subscriptions/analytics')
  getSubscriptionAnalytics() {
    return this.subscriptionsService.getAnalytics();
  }

  /** GET /admin/subscriptions/:audience/:id — single subscription detail */
  @Get('subscriptions/:audience/:id')
  getSubscription(
    @Param('audience') audience: PlanAudience,
    @Param('id') id: string,
  ) {
    if (audience !== 'driver' && audience !== 'company') {
      throw new NotFoundException('Unknown audience');
    }
    return this.subscriptionsService.getSubscription(audience, id);
  }

  /**
   * POST /admin/subscriptions/:audience/:id/mark-paid
   * Mark a subscription as paid in cash. Optionally switch plan and override
   * the new period end date.
   */
  @Post('subscriptions/:audience/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  async markSubscriptionPaid(
    @Request() req: any,
    @Param('audience') audience: PlanAudience,
    @Param('id') id: string,
    @Body() dto: MarkPaidDto,
  ) {
    if (audience !== 'driver' && audience !== 'company') {
      throw new NotFoundException('Unknown audience');
    }
    const updated = await this.subscriptionsService.markSubscriptionPaid(
      req.user.id,
      audience,
      id,
      {
        newPlanId:        dto.newPlanId,
        newPeriodEnd:     dto.newPeriodEnd ? new Date(dto.newPeriodEnd) : undefined,
        paymentReference: dto.paymentReference,
      },
    );
    await this.auditService.log({
      adminId:    req.user.id,
      adminPhone: req.user.phone ?? null,
      action:     'subscription.cash_paid',
      targetType: `${audience}_subscription`,
      targetId:   id,
      metadata: {
        newPlanId:        dto.newPlanId ?? null,
        newPeriodEnd:     dto.newPeriodEnd ?? null,
        paymentReference: dto.paymentReference ?? null,
      },
    });
    return updated;
  }

  /**
   * PATCH /admin/subscriptions/:audience/:id
   * Adjust plan and/or period end without recording a new payment.
   */
  @Patch('subscriptions/:audience/:id')
  async updateSubscription(
    @Request() req: any,
    @Param('audience') audience: PlanAudience,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    if (audience !== 'driver' && audience !== 'company') {
      throw new NotFoundException('Unknown audience');
    }
    const updated = await this.subscriptionsService.adminUpdateSubscription(audience, id, {
      newPlanId:    dto.newPlanId,
      newPeriodEnd: dto.newPeriodEnd ? new Date(dto.newPeriodEnd) : undefined,
    });
    await this.auditService.log({
      adminId:    req.user.id,
      adminPhone: req.user.phone ?? null,
      action:     'subscription.admin_updated',
      targetType: `${audience}_subscription`,
      targetId:   id,
      metadata:   { ...dto },
    });
    return updated;
  }

  // ── Promo Code Management ──────────────────────────────────────────────────

  /** GET /admin/promo-codes?page=1&limit=20 — list all promo codes */
  @Get('promo-codes')
  async listPromoCodes(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const [codes, total] = await this.promoRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { codes: codes.map(c => this.mapPromo(c)), total };
  }

  /** POST /admin/promo-codes — create a new promo code */
  @Post('promo-codes')
  @HttpCode(HttpStatus.CREATED)
  async createPromoCode(@Body() dto: CreatePromoDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.promoRepo.findOne({ where: { code } });
    if (existing) throw new ForbiddenException(`Code "${code}" already exists`);

    const promo = this.promoRepo.create({
      code,
      description:       dto.description ?? null,
      discountType:      dto.discountType,
      discountValue:     dto.discountValue,
      maxDiscountAmount: dto.maxDiscountAmount ?? null,
      minimumFare:       dto.minimumFare ?? null,
      maxUses:           dto.maxUses ?? null,
      expiresAt:         dto.expiresAt ? new Date(dto.expiresAt) : null,
      isActive:          true,
    });
    const saved = await this.promoRepo.save(promo);
    return this.mapPromo(saved);
  }

  /** PATCH /admin/promo-codes/:id — update fields */
  @Patch('promo-codes/:id')
  async updatePromoCode(
    @Param('id') id: string,
    @Body() dto: UpdatePromoDto,
  ) {
    const promo = await this.promoRepo.findOne({ where: { id } });
    if (!promo) throw new NotFoundException('Promo code not found');

    if (dto.code           !== undefined) promo.code              = dto.code.trim().toUpperCase();
    if (dto.description    !== undefined) promo.description       = dto.description ?? null;
    if (dto.discountType   !== undefined) promo.discountType      = dto.discountType;
    if (dto.discountValue  !== undefined) promo.discountValue     = dto.discountValue;
    if (dto.maxDiscountAmount !== undefined) promo.maxDiscountAmount = dto.maxDiscountAmount ?? null;
    if (dto.minimumFare    !== undefined) promo.minimumFare       = dto.minimumFare ?? null;
    if (dto.maxUses        !== undefined) promo.maxUses           = dto.maxUses ?? null;
    if (dto.expiresAt      !== undefined) promo.expiresAt         = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.isActive       !== undefined) promo.isActive          = dto.isActive;

    const saved = await this.promoRepo.save(promo);
    return this.mapPromo(saved);
  }

  /** DELETE /admin/promo-codes/:id — permanently delete */
  @Delete('promo-codes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePromoCode(@Param('id') id: string): Promise<void> {
    const promo = await this.promoRepo.findOne({ where: { id } });
    if (!promo) throw new NotFoundException('Promo code not found');
    await this.promoRepo.remove(promo);
  }

  private mapPromo(p: PromoCode) {
    const now = new Date();
    const expired  = p.expiresAt != null && p.expiresAt < now;
    const exhausted = p.maxUses != null && p.usedCount >= p.maxUses;
    return {
      id:                p.id,
      code:              p.code,
      description:       p.description,
      discountType:      p.discountType,
      discountValue:     Number(p.discountValue),
      maxDiscountAmount: p.maxDiscountAmount != null ? Number(p.maxDiscountAmount) : null,
      minimumFare:       p.minimumFare != null ? Number(p.minimumFare) : null,
      maxUses:           p.maxUses,
      usedCount:         p.usedCount,
      usesRemaining:     p.maxUses != null ? Math.max(0, p.maxUses - p.usedCount) : null,
      expiresAt:         p.expiresAt,
      isActive:          p.isActive,
      isValid:           p.isActive && !expired && !exhausted,
      createdAt:         p.createdAt,
      updatedAt:         p.updatedAt,
    };
  }
}

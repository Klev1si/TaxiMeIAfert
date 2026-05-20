import {
  Controller, Get, Post, Patch, Delete,
  Query, Param, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
  NotFoundException, ForbiddenException, ConflictException, BadRequestException,
  HttpCode, HttpStatus, Inject,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, DataSource, In } from 'typeorm';
import { IsString, IsNumber, IsBoolean, IsOptional, IsInt, Min, Max,
         MaxLength, MinLength, IsNotEmpty, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, RideStatus } from '../common/enums';
import { Company, CompanySubscription, Driver, Ride, SubscriptionPlan, Tariff, User } from '../entities';
import { GpsService } from '../gps/gps.service';

// ── DTOs ──────────────────────────────────────────────────────────────────────

class CreateTariffDto {
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

  @IsBoolean() @IsOptional()
  isNightTariff?: boolean;

  @IsInt() @Min(0) @Max(23) @IsOptional() @Type(() => Number)
  nightStartHour?: number;

  @IsInt() @Min(0) @Max(23) @IsOptional() @Type(() => Number)
  nightEndHour?: number;

  /** Surge multiplier: 1.00 = no surge, 2.00 = double fare. Defaults to 1.00. */
  @IsNumber() @Min(1) @Max(10) @IsOptional() @Type(() => Number)
  surgeMultiplier?: number;
}

class UpdateTariffDto {
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

  @IsBoolean() @IsOptional()
  isNightTariff?: boolean;

  @IsInt() @Min(0) @Max(23) @IsOptional() @Type(() => Number)
  nightStartHour?: number;

  @IsInt() @Min(0) @Max(23) @IsOptional() @Type(() => Number)
  nightEndHour?: number;

  /** Surge multiplier: 1.00 = no surge, 2.00 = double fare. */
  @IsNumber() @Min(1) @Max(10) @IsOptional() @Type(() => Number)
  surgeMultiplier?: number;
}

class AddDriverDto {
  @IsString() @IsNotEmpty()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164 format (e.g. +37491123456)' })
  phone: string;

  @IsString() @MinLength(6) @MaxLength(64)
  password: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  firstName: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  lastName: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  licenseNumber: string;

  @IsString() @IsNotEmpty() @MaxLength(60)
  vehicleMake: string;

  @IsString() @IsNotEmpty() @MaxLength(60)
  vehicleModel: string;

  @IsInt() @Min(1990) @Max(2100) @Type(() => Number)
  vehicleYear: number;

  @IsString() @IsNotEmpty() @MaxLength(20)
  vehiclePlate: string;

  @IsString() @IsOptional() @MaxLength(40)
  vehicleColor?: string;
}

class SetCommissionDto {
  @IsNumber() @Min(0) @Max(100) @Type(() => Number)
  driverCommissionPct: number;
}

/** Returns the UTC start of the requested reporting period, or null for 'all'. */
function periodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case 'today': { const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d; }
    case 'week':  { const d = new Date(now); d.setUTCDate(d.getUTCDate() - 6); d.setUTCHours(0, 0, 0, 0); return d; }
    case 'month': { const d = new Date(now); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d; }
    default: return null;
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPANY)
export class CompanyController {
  constructor(
    @InjectRepository(Company)              private readonly companyRepo: Repository<Company>,
    @InjectRepository(Driver)               private readonly driverRepo:  Repository<Driver>,
    @InjectRepository(Ride)                 private readonly rideRepo:    Repository<Ride>,
    @InjectRepository(Tariff)               private readonly tariffRepo:  Repository<Tariff>,
    @InjectRepository(CompanySubscription)  private readonly subRepo:     Repository<CompanySubscription>,
    @InjectRepository(SubscriptionPlan)     private readonly planRepo:    Repository<SubscriptionPlan>,
    private readonly gpsService: GpsService,
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolveCompany(userId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { userId } });
    if (!company) throw new NotFoundException('Company profile not found');
    return company;
  }

  private async resolveTariff(tariffId: string, companyId: string): Promise<Tariff> {
    const tariff = await this.tariffRepo.findOne({ where: { id: tariffId } });
    if (!tariff) throw new NotFoundException('Tariff not found');
    if (tariff.companyId !== companyId) throw new ForbiddenException('Access denied');
    return tariff;
  }

  // ── GET /company/stats ─────────────────────────────────────────────────────
  @Get('stats')
  async getStats(@CurrentUser() user: User) {
    const company = await this.companyRepo.findOne({ where: { userId: user.id } });
    if (!company) {
      return {
        totalRides: 0, completedRides: 0, cancelledRides: 0,
        activeDrivers: 0, pendingDrivers: 0, totalClients: 0, totalCompanies: 1,
      };
    }

    const [totalRides, completedRides, cancelledRides, activeDrivers, pendingDrivers] =
      await Promise.all([
        this.rideRepo.count({ where: { companyId: company.id } }),
        this.rideRepo.count({ where: { companyId: company.id, status: RideStatus.COMPLETED } }),
        this.rideRepo.count({ where: { companyId: company.id, status: RideStatus.CANCELLED } }),
        this.driverRepo.count({ where: { companyId: company.id, isApproved: true } }),
        this.driverRepo.count({ where: { companyId: company.id, isApproved: false } }),
      ]);

    return {
      totalRides, completedRides, cancelledRides,
      activeDrivers, pendingDrivers,
      totalClients: 0, totalCompanies: 1,
      driverCommissionPct: Number(company.driverCommissionPct),
    };
  }

  // ── GET /company/rides?status=all&page=1&limit=20 ─────────────────────────
  @Get('rides')
  async getRides(
    @CurrentUser() user: User,
    @Query('status') status: RideStatus | 'all' = 'all',
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const company = await this.resolveCompany(user.id);
    const where: FindOptionsWhere<Ride> = { companyId: company.id };
    if (status !== 'all') where.status = status as RideStatus;

    const [rides, total] = await this.rideRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      rides: rides.map(r => ({
        id:             r.id,
        status:         r.status,
        clientId:       r.clientId,
        driverId:       r.driverId,
        pickupAddress:  r.pickupAddress,
        dropoffAddress: r.dropoffAddress,
        paymentStatus:  r.paymentStatus,
        cancelReason:   r.cancelReason,
        driverRating:   r.driverRating,
        clientRating:   r.clientRating,
        totalFare:      r.totalFare != null ? Number(r.totalFare) : null,
        discountAmount: r.discountAmount != null ? Number(r.discountAmount) : null,
        promoCode:      r.promoCode,
        distanceKm:     r.distanceKm != null ? Number(r.distanceKm) : null,
        durationMinutes:r.durationMinutes != null ? Number(r.durationMinutes) : null,
        createdAt:      r.createdAt,
        completedAt:    r.completedAt,
        cancelledAt:    r.cancelledAt,
      })),
      total,
    };
  }

  // ── GET /company/rides/:rideId/chat ──────────────────────────────────────
  // Returns the Redis-persisted chat log for an active or recently completed ride.
  // Messages are stored for 24 h after the ride ends then auto-expire.
  @Get('rides/:rideId/chat')
  async getRideChat(
    @CurrentUser() user: User,
    @Param('rideId') rideId: string,
  ) {
    const company = await this.resolveCompany(user.id);

    // Verify the ride belongs to this company
    const ride = await this.rideRepo.findOne({ where: { id: rideId, companyId: company.id } });
    if (!ride) throw new NotFoundException('Ride not found');

    const raw = await this.redis.lrange(`ride:chat:${rideId}`, 0, -1);
    const messages = raw.map(m => {
      try { return JSON.parse(m); } catch { return null; }
    }).filter(Boolean);

    return {
      rideId,
      status: ride.status,
      messages, // [{ rideId, text, fromRole: 'driver'|'client', ts }]
    };
  }

  // ── GET /company/drivers?page=1&limit=20&filter=all&search= ───────────────
  @Get('drivers')
  async getDrivers(
    @CurrentUser() user: User,
    @Query('filter') filter: 'all' | 'pending' | 'approved' = 'all',
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const company = await this.resolveCompany(user.id);
    const baseWhere: FindOptionsWhere<Driver> = { companyId: company.id };
    if (filter === 'pending')  baseWhere.isApproved = false;
    if (filter === 'approved') baseWhere.isApproved = true;

    if (search) {
      const [byPlate, byName, total] = await Promise.all([
        this.driverRepo.find({ where: { ...baseWhere, vehiclePlate: Like(`%${search}%`) }, take: limit }),
        this.driverRepo.find({ where: { ...baseWhere, lastName:     Like(`%${search}%`) }, take: limit }),
        this.driverRepo.count({ where: baseWhere }),
      ]);
      const seen = new Set<string>();
      const drivers = [...byPlate, ...byName].filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
      return { drivers: drivers.map(d => this.mapDriver(d)), total };
    }

    const [drivers, total] = await this.driverRepo.findAndCount({
      where: baseWhere,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { drivers: drivers.map(d => this.mapDriver(d)), total };
  }

  /** POST /company/drivers — company registers a driver directly (no OTP required) */
  @Post('drivers')
  async addDriver(
    @CurrentUser() user: User,
    @Body() dto: AddDriverDto,
  ) {
    const company = await this.resolveCompany(user.id);

    // ── Subscription plan driver-limit check ──────────────────────────────────
    // Find the company's active/trialing subscription and its plan's maxDrivers.
    // If the company has no subscription or the plan limit is reached, block the add.
    const subscription = await this.subRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.companyId = :companyId', { companyId: company.id })
      .andWhere('sub.status IN (:...statuses)', { statuses: ['active', 'trialing'] })
      .orderBy('sub.createdAt', 'DESC')
      .getOne();

    if (!subscription) {
      throw new ForbiddenException(
        'No active subscription. Please subscribe to a plan before adding drivers.',
      );
    }

    const currentDriverCount = await this.driverRepo.count({
      where: { companyId: company.id },
    });

    if (currentDriverCount >= subscription.plan.maxDrivers) {
      throw new ForbiddenException(
        `Driver limit reached. Your "${subscription.plan.name}" plan allows up to ` +
        `${subscription.plan.maxDrivers} driver(s). ` +
        `Upgrade your plan to add more drivers.`,
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Check phone uniqueness
    const existing = await this.dataSource
      .getRepository(User)
      .findOne({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('A user with this phone already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const driver = await this.dataSource.transaction(async em => {
      const newUser = em.create(User, {
        phone:           dto.phone,
        passwordHash,
        role:            UserRole.DRIVER,
        isPhoneVerified: true,   // company vouches for the driver
        isActive:        true,
      });
      await em.save(newUser);

      const newDriver = em.create(Driver, {
        userId:        newUser.id,
        companyId:     company.id,
        firstName:     dto.firstName,
        lastName:      dto.lastName,
        licenseNumber: dto.licenseNumber.toUpperCase(),
        vehicleMake:   dto.vehicleMake,
        vehicleModel:  dto.vehicleModel,
        vehicleYear:   dto.vehicleYear,
        vehiclePlate:  dto.vehiclePlate.toUpperCase(),
        vehicleColor:  dto.vehicleColor ?? null,
        isApproved:    false,
        isOnline:      false,
      });
      await em.save(newDriver);
      return newDriver;
    });

    return this.mapDriver(driver);
  }

  private mapDriver(d: Driver) {
    return {
      id:            d.id,
      userId:        d.userId,
      companyId:     d.companyId,
      firstName:     d.firstName,
      lastName:      d.lastName,
      licenseNumber: d.licenseNumber,
      vehicleMake:   d.vehicleMake,
      vehicleModel:  d.vehicleModel,
      vehicleYear:   d.vehicleYear,
      vehiclePlate:  d.vehiclePlate,
      vehicleColor:  d.vehicleColor,
      isApproved:    d.isApproved,
      isOnline:      d.isOnline,
      rating:        Number(d.rating),
      totalRides:    d.totalRides,
      createdAt:     d.createdAt,
    };
  }

  // ── GET /company/live-drivers ─────────────────────────────────────────────
  @Get('live-drivers')
  async getLiveDrivers(@CurrentUser() user: User) {
    const company = await this.resolveCompany(user.id);

    const onlineDrivers = await this.driverRepo.find({
      where:  { companyId: company.id, isOnline: true },
      select: ['id', 'firstName', 'lastName', 'vehiclePlate', 'vehicleMake', 'vehicleModel', 'vehicleColor', 'currentLat', 'currentLng', 'lastLocationAt'],
    });

    if (onlineDrivers.length === 0) return [];

    const allLocations = await this.gpsService.getAllOnlineDriverLocations();
    const locMap = new Map(allLocations.map(l => [l.driverId, l]));

    return onlineDrivers.map(d => {
      const loc = locMap.get(d.id);
      return {
        driverId:     d.id,
        lat:          loc?.lat     ?? (d.currentLat     != null ? Number(d.currentLat)       : 0),
        lng:          loc?.lng     ?? (d.currentLng     != null ? Number(d.currentLng)       : 0),
        lastSeenMs:   loc?.ts      ?? (d.lastLocationAt != null ? d.lastLocationAt.getTime() : 0),
        firstName:    d.firstName,
        lastName:     d.lastName,
        vehiclePlate: d.vehiclePlate,
        vehicleMake:  d.vehicleMake,
        vehicleModel: d.vehicleModel,
        vehicleColor: d.vehicleColor,
      };
    });
  }

  // ── Earnings ───────────────────────────────────────────────────────────────

  /**
   * GET /company/earnings?period=today|week|month|all
   *
   * Returns per-driver earnings breakdown + company-wide totals.
   * Each row shows: totalFare for the period, the driver's share, and the
   * company's share — split by driverCommissionPct on the Company row.
   */
  @Get('earnings')
  async getEarnings(
    @CurrentUser() user: User,
    @Query('period') period = 'all',
  ) {
    const company = await this.resolveCompany(user.id);
    const commissionPct = Number(company.driverCommissionPct); // driver's %
    const since = periodStart(period);

    // All completed rides with a fare for this company
    const qb = this.rideRepo
      .createQueryBuilder('r')
      .where('r.company_id = :companyId', { companyId: company.id })
      .andWhere('r.status = :status', { status: RideStatus.COMPLETED })
      .andWhere('r.total_fare IS NOT NULL')
      .select(['r.driver_id AS driver_id', 'SUM(r.total_fare) AS fare_sum', 'COUNT(*) AS ride_count']);

    if (since) qb.andWhere('r.completed_at >= :since', { since });
    qb.groupBy('r.driver_id');

    const rows: { driver_id: string; fare_sum: string; ride_count: string }[] =
      await qb.getRawMany();

    // Fetch driver profiles for all driver IDs in the result
    const driverIds = rows.map(r => r.driver_id).filter(Boolean);
    const drivers = driverIds.length
      ? await this.driverRepo.find({ where: { id: In(driverIds) } })
      : [];
    const driverMap = new Map(drivers.map(d => [d.id, d]));

    const perDriver = rows.map(row => {
      const totalFare   = Number(row.fare_sum ?? 0);
      const driverShare = Math.round(totalFare * commissionPct)  / 100;
      const companyShare= Math.round(totalFare * (100 - commissionPct)) / 100;
      const d = driverMap.get(row.driver_id);
      return {
        driverId:    row.driver_id,
        firstName:   d?.firstName ?? null,
        lastName:    d?.lastName  ?? null,
        rides:       Number(row.ride_count),
        totalFare:   Math.round(totalFare * 100) / 100,
        driverShare: Math.round(driverShare * 100) / 100,
        companyShare:Math.round(companyShare * 100) / 100,
      };
    });

    const grandTotal    = perDriver.reduce((s, r) => s + r.totalFare,    0);
    const grandDriver   = perDriver.reduce((s, r) => s + r.driverShare,  0);
    const grandCompany  = perDriver.reduce((s, r) => s + r.companyShare, 0);
    const grandRides    = perDriver.reduce((s, r) => s + r.rides,        0);

    return {
      period,
      commissionPct,
      summary: {
        rides:        grandRides,
        totalFare:    Math.round(grandTotal   * 100) / 100,
        driverShare:  Math.round(grandDriver  * 100) / 100,
        companyShare: Math.round(grandCompany * 100) / 100,
      },
      perDriver,
    };
  }

  /**
   * PATCH /company/commission
   * Update the company's driver commission percentage.
   * driverCommissionPct = the share the DRIVER keeps (0–100).
   */
  @Patch('commission')
  async setCommission(
    @CurrentUser() user: User,
    @Body() dto: SetCommissionDto,
  ) {
    const company = await this.resolveCompany(user.id);
    await this.companyRepo.update(company.id, { driverCommissionPct: dto.driverCommissionPct });
    return { driverCommissionPct: dto.driverCommissionPct };
  }

  // ── Tariffs ────────────────────────────────────────────────────────────────

  /** GET /company/tariffs — list all tariffs for this company */
  @Get('tariffs')
  async getTariffs(@CurrentUser() user: User) {
    const company = await this.resolveCompany(user.id);
    const tariffs = await this.tariffRepo.find({
      where: { companyId: company.id },
      order: { createdAt: 'ASC' },
    });
    return tariffs.map(t => this.mapTariff(t));
  }

  /** POST /company/tariffs — create a new tariff */
  @Post('tariffs')
  async createTariff(
    @CurrentUser() user: User,
    @Body() dto: CreateTariffDto,
  ) {
    const company = await this.resolveCompany(user.id);
    const tariff  = this.tariffRepo.create({
      companyId:       company.id,
      name:            dto.name,
      baseFare:        dto.baseFare,
      perKmRate:       dto.perKmRate,
      perMinuteRate:   dto.perMinuteRate,
      minimumFare:     dto.minimumFare,
      surgeMultiplier: dto.surgeMultiplier ?? 1.00,
      isNightTariff:   dto.isNightTariff  ?? false,
      nightStartHour:  dto.nightStartHour ?? null,
      nightEndHour:    dto.nightEndHour   ?? null,
      isActive:        true,
    });
    await this.tariffRepo.save(tariff);
    return this.mapTariff(tariff);
  }

  /** PATCH /company/tariffs/:id — update fields */
  @Patch('tariffs/:id')
  async updateTariff(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateTariffDto,
  ) {
    const company = await this.resolveCompany(user.id);
    const tariff  = await this.resolveTariff(id, company.id);

    if (dto.name            !== undefined) tariff.name            = dto.name;
    if (dto.baseFare        !== undefined) tariff.baseFare        = dto.baseFare;
    if (dto.perKmRate       !== undefined) tariff.perKmRate       = dto.perKmRate;
    if (dto.perMinuteRate   !== undefined) tariff.perMinuteRate   = dto.perMinuteRate;
    if (dto.minimumFare     !== undefined) tariff.minimumFare     = dto.minimumFare;
    if (dto.surgeMultiplier !== undefined) tariff.surgeMultiplier = dto.surgeMultiplier;
    if (dto.isNightTariff   !== undefined) tariff.isNightTariff   = dto.isNightTariff;
    if (dto.nightStartHour  !== undefined) tariff.nightStartHour  = dto.nightStartHour ?? null;
    if (dto.nightEndHour    !== undefined) tariff.nightEndHour    = dto.nightEndHour   ?? null;

    await this.tariffRepo.save(tariff);
    return this.mapTariff(tariff);
  }

  /** DELETE /company/tariffs/:id — deactivate (soft delete) */
  @Delete('tariffs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateTariff(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    const company = await this.resolveCompany(user.id);
    const tariff  = await this.resolveTariff(id, company.id);
    await this.tariffRepo.update(tariff.id, { isActive: false });
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
      isNightTariff:   t.isNightTariff,
      nightStartHour:  t.nightStartHour,
      nightEndHour:    t.nightEndHour,
      isActive:        t.isActive,
      createdAt:       t.createdAt,
    };
  }
}

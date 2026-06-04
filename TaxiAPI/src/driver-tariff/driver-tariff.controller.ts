import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsNull, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Driver } from '../entities/driver.entity';
import { Tariff } from '../entities/tariff.entity';
import { UserRole, VehicleType } from '../common/enums';

class TariffUpsertDto {
  @IsString() @MaxLength(80)
  name: string;

  @IsNumber() @Min(0)
  baseFare: number;

  @IsNumber() @Min(0)
  perKmRate: number;

  @IsNumber() @Min(0)
  perMinuteRate: number;

  @IsNumber() @Min(0)
  minimumFare: number;

  @IsOptional() @IsNumber() @Min(1) @Max(5)
  surgeMultiplier?: number;

  @IsOptional() @IsBoolean()
  isNightTariff?: boolean;

  @IsOptional() @IsNumber() @Min(0) @Max(23)
  nightStartHour?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(23)
  nightEndHour?: number;

  @IsOptional() @IsEnum(VehicleType)
  vehicleType?: VehicleType;
}

/**
 * Driver-side tariff management.
 * Only **solo drivers** (no company) may set their own tariff.
 * Drivers attached to a company use the company's tariff and cannot override it.
 *
 * Endpoints under /driver/tariff:
 *   GET    /driver/tariff           — list this driver's tariffs (usually 1)
 *   PUT    /driver/tariff           — create or replace the driver's tariff
 *   DELETE /driver/tariff/:id       — deactivate one
 */
@Controller('driver/tariff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class DriverTariffController {
  constructor(
    @InjectRepository(Tariff)
    private readonly tariffRepo: Repository<Tariff>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
  ) {}

  /** GET /driver/tariff — return the driver's personal tariff list */
  @Get()
  async getMyTariffs(@Request() req: { user: { id: string } }) {
    const driver = await this.resolveDriver(req.user.id);
    const tariffs = await this.tariffRepo.find({
      where: { driverId: driver.id, isActive: true },
      order: { createdAt: 'ASC' },
    });
    return tariffs.map(this.mapTariff);
  }

  /**
   * PUT /driver/tariff — upsert (replace) the driver's tariff.
   * If a tariff already exists for this driver+vehicleType, it is updated;
   * otherwise a new row is inserted. Solo drivers only.
   */
  @Put()
  async upsertMyTariff(
    @Request() req: { user: { id: string } },
    @Body() dto: TariffUpsertDto,
  ) {
    const driver = await this.resolveSoloDriver(req.user.id);

    // TypeORM's findOne `where` clause requires IsNull() for nullable columns
    // — passing literal `null` is a type error in strict mode.
    const existing = await this.tariffRepo.findOne({
      where: {
        driverId:    driver.id,
        vehicleType: dto.vehicleType ?? IsNull(),
        isActive:    true,
      },
    });

    if (existing) {
      Object.assign(existing, {
        name:            dto.name,
        baseFare:        dto.baseFare,
        perKmRate:       dto.perKmRate,
        perMinuteRate:   dto.perMinuteRate,
        minimumFare:     dto.minimumFare,
        surgeMultiplier: dto.surgeMultiplier ?? 1,
        isNightTariff:   dto.isNightTariff   ?? false,
        nightStartHour:  dto.nightStartHour  ?? null,
        nightEndHour:    dto.nightEndHour    ?? null,
        vehicleType:     dto.vehicleType     ?? null,
      });
      await this.tariffRepo.save(existing);
      return this.mapTariff(existing);
    }

    const tariff = this.tariffRepo.create({
      companyId:       null,
      driverId:        driver.id,
      name:            dto.name,
      baseFare:        dto.baseFare,
      perKmRate:       dto.perKmRate,
      perMinuteRate:   dto.perMinuteRate,
      minimumFare:     dto.minimumFare,
      surgeMultiplier: dto.surgeMultiplier ?? 1,
      isNightTariff:   dto.isNightTariff   ?? false,
      nightStartHour:  dto.nightStartHour  ?? null,
      nightEndHour:    dto.nightEndHour    ?? null,
      vehicleType:     dto.vehicleType     ?? null,
      isActive:        true,
    });
    await this.tariffRepo.save(tariff);
    return this.mapTariff(tariff);
  }

  /** DELETE /driver/tariff/:id — deactivate one of the driver's tariffs */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const driver = await this.resolveSoloDriver(req.user.id);
    const tariff = await this.tariffRepo.findOne({ where: { id } });
    if (!tariff || tariff.driverId !== driver.id) {
      throw new NotFoundException('Tariff not found');
    }
    tariff.isActive = false;
    await this.tariffRepo.save(tariff);
  }

  /**
   * GET /driver/tariff/active — returns the tariff that would be applied
   * RIGHT NOW for a ride this driver accepts. Mirrors the resolution chain
   * used by selectActiveTariff in rides.service: solo personal → company →
   * global, plus vehicle-type + night-window filtering.
   */
  @Get('active')
  async getActiveTariff(@Request() req: { user: { id: string } }) {
    const driver = await this.resolveDriver(req.user.id);

    // Build the candidate pool the same way rides.service does
    const isNightWindow = (h: number, s: number | null, e: number | null) => {
      if (s == null || e == null) return false;
      return s <= e ? (h >= s && h < e) : (h >= s || h < e);
    };

    const pickFromPool = (pool: Tariff[]): Tariff | null => {
      if (pool.length === 0) return null;
      const typed   = driver.vehicleType ? pool.filter(t => t.vehicleType === driver.vehicleType) : [];
      const generic = pool.filter(t => t.vehicleType == null);
      const candidates = (typed.length > 0 ? typed : generic.length > 0 ? generic : pool);
      const hour = new Date().getUTCHours();
      const night = candidates.find(t =>
        t.isNightTariff && t.nightStartHour != null && t.nightEndHour != null &&
        isNightWindow(hour, t.nightStartHour, t.nightEndHour),
      );
      if (night) return night;
      const day = candidates.find(t => !t.isNightTariff);
      return day ?? candidates[0];
    };

    // 1. Solo driver's personal tariff wins if present
    if (!driver.companyId) {
      const personal = await this.tariffRepo.find({
        where: { driverId: driver.id, isActive: true },
      });
      const picked = pickFromPool(personal);
      if (picked) return { source: 'personal', ...this.mapTariff(picked) };
    }

    // 2. Company tariff, if the driver is in a company
    if (driver.companyId) {
      const company = await this.tariffRepo.find({
        where: { companyId: driver.companyId, isActive: true },
      });
      const picked = pickFromPool(company);
      if (picked) return { source: 'company', ...this.mapTariff(picked) };
    }

    // 3. Fallback to global / admin tariff (solo drivers w/o personal)
    if (!driver.companyId) {
      const global = await this.tariffRepo.find({
        where: { companyId: IsNull(), driverId: IsNull(), isActive: true },
      });
      const picked = pickFromPool(global);
      if (picked) return { source: 'global', ...this.mapTariff(picked) };
    }

    return null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolveDriver(userId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    return driver;
  }

  private async resolveSoloDriver(userId: string): Promise<Driver> {
    const driver = await this.resolveDriver(userId);
    if (driver.companyId) {
      throw new ForbiddenException(
        'Your tariff is managed by your company. Contact your company admin to change it.',
      );
    }
    return driver;
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
      vehicleType:     t.vehicleType,
      isActive:        t.isActive,
    };
  }
}

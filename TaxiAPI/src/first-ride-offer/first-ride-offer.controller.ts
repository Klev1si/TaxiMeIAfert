import { Body, Controller, Get, HttpCode, HttpStatus, Put, Request, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuditService } from '../audit/audit.service.js';
import {
  FirstRideOfferService,
  type FirstRideOffer,
  type FirstRideOfferStatus,
} from './first-ride-offer.service.js';

class UpdateFirstRideOfferDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  /** 1–100. 100 = the first ride is free. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  discountPct?: number;

  /** Maximum ride distance (km) that counts as "inside the city". */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(1000)
  maxKm?: number;
}

/** GET /first-ride-offer — the current offer and whether this passenger gets it. */
@Controller('first-ride-offer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FirstRideOfferController {
  constructor(private readonly offers: FirstRideOfferService) {}

  @Get()
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.OK)
  get(@Request() req: { user: { id: string } }): Promise<FirstRideOfferStatus> {
    return this.offers.statusForUser(req.user.id);
  }
}

/** Admin: read / change the first-ride offer without a deploy. */
@Controller('admin/first-ride-offer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminFirstRideOfferController {
  constructor(
    private readonly offers: FirstRideOfferService,
    private readonly audit:  AuditService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  get(): Promise<FirstRideOffer> {
    return this.offers.getOffer();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async update(
    @Request() req: { user: { id: string; phone?: string | null } },
    @Body() dto: UpdateFirstRideOfferDto,
  ): Promise<FirstRideOffer> {
    const before = await this.offers.getOffer();
    const after  = await this.offers.updateOffer(dto);
    void this.audit.log({
      adminId:    req.user.id,
      adminPhone: req.user.phone ?? null,
      action:     'first_ride_offer.update',
      targetType: 'platform_setting',
      targetId:   null,
      metadata:   { before, after },
    });
    return after;
  }
}

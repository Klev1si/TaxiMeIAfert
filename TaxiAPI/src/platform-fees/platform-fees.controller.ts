import { Body, Controller, Get, HttpCode, HttpStatus, Put, Request, UseGuards } from '@nestjs/common';
import { IsNumber, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuditService } from '../audit/audit.service.js';
import { PlatformFeesService, type PlatformFees } from './platform-fees.service.js';

class UpdatePlatformFeesDto {
  /** % of every card-paid ride kept by the platform (0–50). */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(50)
  cardFeePct: number;
}

/** Super-admin: GET/PUT /admin/platform-fees */
@Controller('admin/platform-fees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PlatformFeesController {
  constructor(
    private readonly fees:  PlatformFeesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  get(): Promise<PlatformFees> {
    return this.fees.get();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async update(
    @Request() req: { user: { id: string; phone?: string | null } },
    @Body() dto: UpdatePlatformFeesDto,
  ): Promise<PlatformFees> {
    const before = await this.fees.get();
    const after  = await this.fees.update(dto);
    void this.audit.log({
      adminId: req.user.id, adminPhone: req.user.phone ?? null,
      action: 'platform_fees.update', targetType: 'platform_setting', targetId: null,
      metadata: { before, after },
    });
    return after;
  }
}

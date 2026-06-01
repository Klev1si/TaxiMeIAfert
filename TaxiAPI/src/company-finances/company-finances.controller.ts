import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CompanyFinancesService } from './company-finances.service';
import type { FinancePeriod } from './company-finances.service';
import type { SettlementDirection } from '../entities/company-settlement.entity';

class SettleDto {
  @IsIn(['cash_in', 'card_out'])
  direction: SettlementDirection;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amount: number;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

class CommissionDto {
  /** Driver's commission % (0-100). Set to null to revert to company default. */
  @ValidateIf(o => o.pct !== null)
  @IsNumber() @Min(0) @Max(100) @Type(() => Number)
  pct: number | null;
}

@Controller('company/finances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPANY)
export class CompanyFinancesController {
  constructor(private readonly svc: CompanyFinancesService) {}

  /** GET /company/finances/summary?period=today|week|month|all */
  @Get('summary')
  getSummary(
    @Request() req: { user: { id: string } },
    @Query('period') period: FinancePeriod = 'all',
  ) {
    return this.svc.getSummary(req.user.id, period);
  }

  /** GET /company/finances/drivers?period=... */
  @Get('drivers')
  getDrivers(
    @Request() req: { user: { id: string } },
    @Query('period') period: FinancePeriod = 'all',
  ) {
    return this.svc.getDrivers(req.user.id, period);
  }

  /** POST /company/finances/drivers/:id/settle */
  @Post('drivers/:id/settle')
  settle(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) driverId: string,
    @Body() dto: SettleDto,
  ) {
    return this.svc.settle(req.user.id, driverId, dto.direction, dto.amount, dto.note);
  }

  /**
   * PATCH /company/finances/drivers/:id/commission
   * Set or clear (`pct: null`) a per-driver commission override.
   */
  @Patch('drivers/:id/commission')
  @HttpCode(HttpStatus.OK)
  setCommission(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) driverId: string,
    @Body() dto: CommissionDto,
  ) {
    return this.svc.setDriverCommission(req.user.id, driverId, dto.pct);
  }
}

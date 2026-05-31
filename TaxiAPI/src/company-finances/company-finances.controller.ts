import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CompanyFinancesService, FinancePeriod } from './company-finances.service';
import type { SettlementDirection } from '../entities/company-settlement.entity';

class SettleDto {
  @IsIn(['cash_in', 'card_out'])
  direction: SettlementDirection;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amount: number;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
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
}

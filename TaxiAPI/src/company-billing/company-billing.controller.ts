import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Request, UseGuards,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuditService } from '../audit/audit.service.js';
import type { CompanyBillingModel } from '../entities/index.js';
import {
  CompanyBillingService,
  type AdminCompanyBillingRow,
  type BillingPeriod,
  type CommissionStatementDto,
} from './company-billing.service.js';

const PERIODS: BillingPeriod[] = ['today', 'week', 'month', 'all'];
const toPeriod = (p?: string): BillingPeriod =>
  PERIODS.includes(p as BillingPeriod) ? (p as BillingPeriod) : 'month';

class SetContractDto {
  @IsIn(['unassigned', 'subscription', 'commission'])
  billingModel: CompanyBillingModel;

  /** Required for 'commission': platform's % of gross ride fares (0 < x ≤ 50). */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(50)
  commissionPct?: number;
}

class RecordPaymentDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000)
  amount: number;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

/** Company: GET /company/billing — my contract and commission statement. */
@Controller('company/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPANY)
export class CompanyBillingController {
  constructor(private readonly billing: CompanyBillingService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  get(
    @Request() req: { user: { id: string } },
    @Query('period') period?: string,
  ): Promise<CommissionStatementDto> {
    return this.billing.statementForUser(req.user.id, toPeriod(period));
  }
}

/** Driver: GET /driver/billing — my contract and commission statement (solo drivers). */
@Controller('driver/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class DriverBillingController {
  constructor(private readonly billing: CompanyBillingService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  get(
    @Request() req: { user: { id: string } },
    @Query('period') period?: string,
  ): Promise<CommissionStatementDto> {
    return this.billing.driverStatementForUser(req.user.id, toPeriod(period));
  }
}

/** Super-admin: choose each company's / solo driver's contract and track payments. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminCompanyBillingController {
  constructor(
    private readonly billing: CompanyBillingService,
    private readonly audit:   AuditService,
  ) {}

  /** GET /admin/company-billing — every company's contract and balance. */
  @Get('company-billing')
  @HttpCode(HttpStatus.OK)
  overview(): Promise<AdminCompanyBillingRow[]> {
    return this.billing.adminOverview();
  }

  /** GET /admin/companies/:id/billing — one company's statement. */
  @Get('companies/:id/billing')
  @HttpCode(HttpStatus.OK)
  statement(
    @Param('id', ParseUUIDPipe) companyId: string,
    @Query('period') period?: string,
  ): Promise<CommissionStatementDto> {
    return this.billing.statement(companyId, toPeriod(period));
  }

  /** PUT /admin/companies/:id/billing — set subscription / commission %. */
  @Put('companies/:id/billing')
  @HttpCode(HttpStatus.OK)
  async setContract(
    @Request() req: { user: { id: string; phone?: string | null } },
    @Param('id', ParseUUIDPipe) companyId: string,
    @Body() dto: SetContractDto,
  ): Promise<CommissionStatementDto> {
    const { before, after } = await this.billing.setContract(companyId, dto.billingModel, dto.commissionPct);
    void this.audit.log({
      adminId:    req.user.id,
      adminPhone: req.user.phone ?? null,
      action:     'company.contract.update',
      targetType: 'company',
      targetId:   companyId,
      metadata:   {
        before: { billingModel: before.billingModel, commissionPct: before.commissionPct },
        after:  { billingModel: after.billingModel,  commissionPct: after.commissionPct },
      },
    });
    return this.billing.statement(companyId, 'month');
  }

  /** POST /admin/companies/:id/commission-payments — company paid us. */
  @Post('companies/:id/commission-payments')
  @HttpCode(HttpStatus.CREATED)
  async recordPayment(
    @Request() req: { user: { id: string; phone?: string | null } },
    @Param('id', ParseUUIDPipe) companyId: string,
    @Body() dto: RecordPaymentDto,
  ): Promise<CommissionStatementDto> {
    const result = await this.billing.recordPayment(companyId, dto.amount, dto.note ?? null, req.user.id);
    void this.audit.log({
      adminId:    req.user.id,
      adminPhone: req.user.phone ?? null,
      action:     'company.commission.payment',
      targetType: 'company',
      targetId:   companyId,
      metadata:   { amount: dto.amount, note: dto.note ?? null },
    });
    return result;
  }

  // ── Solo drivers ───────────────────────────────────────────────────────────

  /** GET /admin/drivers/:id/billing */
  @Get('drivers/:id/billing')
  @HttpCode(HttpStatus.OK)
  driverStatement(
    @Param('id', ParseUUIDPipe) driverId: string,
    @Query('period') period?: string,
  ): Promise<CommissionStatementDto> {
    return this.billing.driverStatement(driverId, toPeriod(period));
  }

  /** PUT /admin/drivers/:id/billing — solo driver: subscription or commission %. */
  @Put('drivers/:id/billing')
  @HttpCode(HttpStatus.OK)
  async setDriverContract(
    @Request() req: { user: { id: string; phone?: string | null } },
    @Param('id', ParseUUIDPipe) driverId: string,
    @Body() dto: SetContractDto,
  ): Promise<CommissionStatementDto> {
    const { before, after } = await this.billing.setDriverContract(driverId, dto.billingModel, dto.commissionPct);
    void this.audit.log({
      adminId: req.user.id, adminPhone: req.user.phone ?? null,
      action: 'driver.contract.update', targetType: 'driver', targetId: driverId,
      metadata: {
        before: { billingModel: before.billingModel, commissionPct: before.commissionPct },
        after:  { billingModel: after.billingModel,  commissionPct: after.commissionPct },
      },
    });
    return this.billing.driverStatement(driverId, 'month');
  }

  /** POST /admin/drivers/:id/commission-payments — solo driver paid us. */
  @Post('drivers/:id/commission-payments')
  @HttpCode(HttpStatus.CREATED)
  async recordDriverPayment(
    @Request() req: { user: { id: string; phone?: string | null } },
    @Param('id', ParseUUIDPipe) driverId: string,
    @Body() dto: RecordPaymentDto,
  ): Promise<CommissionStatementDto> {
    const result = await this.billing.recordDriverPayment(driverId, dto.amount, dto.note ?? null, req.user.id);
    void this.audit.log({
      adminId: req.user.id, adminPhone: req.user.phone ?? null,
      action: 'driver.commission.payment', targetType: 'driver', targetId: driverId,
      metadata: { amount: dto.amount, note: dto.note ?? null },
    });
    return result;
  }
}

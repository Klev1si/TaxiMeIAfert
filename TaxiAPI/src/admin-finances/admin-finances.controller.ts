import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AdminFinancesService } from './admin-finances.service';
import type { FinancePeriod } from './admin-finances.service';

@Controller('admin/finances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminFinancesController {
  constructor(private readonly svc: AdminFinancesService) {}

  /** GET /admin/finances/drivers?period=today|week|month|all */
  @Get('drivers')
  getDrivers(@Query('period') period: FinancePeriod = 'all') {
    return this.svc.getDrivers(period);
  }

  /** GET /admin/finances/companies?period=... */
  @Get('companies')
  getCompanies(@Query('period') period: FinancePeriod = 'all') {
    return this.svc.getCompanies(period);
  }
}

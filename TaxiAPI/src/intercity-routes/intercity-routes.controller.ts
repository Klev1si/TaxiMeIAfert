import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../common/enums/index.js';
import { Company, Driver } from '../entities/index.js';
import { IntercityRoutesService, type IntercityRouteDto } from './intercity-routes.service.js';

interface AuthRequest {
  user: { id: string; role: string };
}

@Controller('intercity-routes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntercityRoutesController {
  constructor(
    private readonly service: IntercityRoutesService,
    @InjectRepository(Driver)  private readonly driverRepo:  Repository<Driver>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
  ) {}

  /**
   * GET /intercity-routes/mine
   * Returns the caller's routes. Solo drivers see their personal routes;
   * company admins see their company routes.
   */
  @Get('mine')
  @Roles(UserRole.DRIVER, UserRole.COMPANY)
  async listMine(@Request() req: AuthRequest) {
    const { ownerType, ownerId } = await this.resolveOwner(req);
    return this.service.list(ownerType, ownerId);
  }

  @Post()
  @Roles(UserRole.DRIVER, UserRole.COMPANY)
  async create(@Request() req: AuthRequest, @Body() dto: IntercityRouteDto) {
    const { ownerType, ownerId } = await this.resolveOwner(req);
    return this.service.create(ownerType, ownerId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.DRIVER, UserRole.COMPANY)
  async update(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() patch: Partial<IntercityRouteDto> & { isActive?: boolean },
  ) {
    const { ownerType, ownerId } = await this.resolveOwner(req);
    return this.service.update(id, ownerType, ownerId, patch);
  }

  @Delete(':id')
  @Roles(UserRole.DRIVER, UserRole.COMPANY)
  async remove(@Request() req: AuthRequest, @Param('id') id: string) {
    const { ownerType, ownerId } = await this.resolveOwner(req);
    await this.service.remove(id, ownerType, ownerId);
    return { ok: true };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Solo drivers own routes under ownerType='driver'. Company accounts own
   * routes under ownerType='company'. Company-employed drivers can't manage
   * routes personally — the company sets them for the fleet.
   */
  private async resolveOwner(
    req: AuthRequest,
  ): Promise<{ ownerType: 'driver' | 'company'; ownerId: string }> {
    if (req.user.role === UserRole.COMPANY) {
      const company = await this.companyRepo.findOne({ where: { userId: req.user.id } });
      if (!company) throw new NotFoundException('Company profile not found');
      return { ownerType: 'company', ownerId: company.id };
    }
    const driver = await this.driverRepo.findOne({ where: { userId: req.user.id } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (driver.companyId != null) {
      throw new ForbiddenException(
        'Drivers under a company cannot manage intercity routes — ask your company admin.',
      );
    }
    return { ownerType: 'driver', ownerId: driver.id };
  }
}

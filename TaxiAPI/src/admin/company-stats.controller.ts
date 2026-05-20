import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, RideStatus } from '../common/enums';
import { Company, Driver, Ride } from '../entities';
import { User } from '../entities';

@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPANY)
export class CompanyStatsController {
  constructor(
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Driver)  private readonly driverRepo:  Repository<Driver>,
    @InjectRepository(Ride)    private readonly rideRepo:    Repository<Ride>,
  ) {}

  // ── GET /company/stats ───────────────────────────────────────────────────────
  @Get('stats')
  async getStats(@CurrentUser() user: User) {
    const company = await this.companyRepo.findOne({ where: { userId: user.id } });
    if (!company) {
      return {
        totalRides: 0, completedRides: 0, cancelledRides: 0,
        activeDrivers: 0, pendingDrivers: 0, driverCommissionPct: 100,
      };
    }

    const [totalRides, completedRides, cancelledRides, activeDrivers, pendingDrivers] =
      await Promise.all([
        this.rideRepo.count({ where: { companyId: company.id } }),
        this.rideRepo.count({ where: { companyId: company.id, status: RideStatus.COMPLETED } }),
        this.rideRepo.count({ where: { companyId: company.id, status: RideStatus.CANCELLED } }),
        this.driverRepo.count({ where: { companyId: company.id, isApproved: true  } }),
        this.driverRepo.count({ where: { companyId: company.id, isApproved: false } }),
      ]);

    return {
      totalRides,
      completedRides,
      cancelledRides,
      activeDrivers,
      pendingDrivers,
      driverCommissionPct: Number(company.driverCommissionPct),
    };
  }

  // ── GET /company/analytics?days=7|14|30 ─────────────────────────────────────
  /**
   * Returns per-day ride counts and revenue for the last N days (default 7,
   * capped at 90).  All days in the range are included even if count = 0.
   */
  @Get('analytics')
  async getAnalytics(
    @CurrentUser() user: User,
    @Query('days') daysParam = '7',
  ): Promise<{
    period:      number;
    ridesPerDay: Array<{ date: string; count: number; revenue: number }>;
    totals: { rides: number; revenue: number };
  }> {
    const empty = { period: 7, ridesPerDay: [], totals: { rides: 0, revenue: 0 } };

    const company = await this.companyRepo.findOne({ where: { userId: user.id } });
    if (!company) return empty;

    const numDays = Math.min(Math.max(Number(daysParam) || 7, 1), 90);

    // Start of the first day in the range (UTC midnight)
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - numDays + 1);
    since.setUTCHours(0, 0, 0, 0);

    // Fetch all completed rides in range (only the columns we need)
    const rides = await this.rideRepo.find({
      where: {
        companyId:   company.id,
        status:      RideStatus.COMPLETED,
        completedAt: MoreThanOrEqual(since),
      },
      select: ['completedAt', 'totalFare'],
    });

    // Pre-fill every day in the window with zeros
    const dayMap = new Map<string, { count: number; revenue: number }>();
    for (let i = 0; i < numDays; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      dayMap.set(d.toISOString().substring(0, 10), { count: 0, revenue: 0 });
    }

    // Accumulate rides per day
    let totalRides   = 0;
    let totalRevenue = 0;
    for (const ride of rides) {
      if (!ride.completedAt) continue;
      const key   = (ride.completedAt as Date).toISOString().substring(0, 10);
      const entry = dayMap.get(key);
      if (!entry) continue;
      entry.count   += 1;
      entry.revenue += Number(ride.totalFare ?? 0);
      totalRides    += 1;
      totalRevenue  += Number(ride.totalFare ?? 0);
    }

    const ridesPerDay = Array.from(dayMap.entries()).map(([date, d]) => ({
      date,
      count:   d.count,
      revenue: Math.round(d.revenue * 100) / 100,
    }));

    return {
      period:      numDays,
      ridesPerDay,
      totals: {
        rides:   totalRides,
        revenue: Math.round(totalRevenue * 100) / 100,
      },
    };
  }
}

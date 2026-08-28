import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, In, DataSource } from 'typeorm';
import { Client, Company, Driver, Ride, User } from '../entities';
import { RideStatus, UserRole } from '../common/enums';
import { GpsService } from '../gps/gps.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

export interface DashboardStats {
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  activeDrivers: number;
  pendingDrivers: number;
  totalClients: number;
  totalCompanies: number;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Ride)    private readonly rideRepo:    Repository<Ride>,
    @InjectRepository(Driver)  private readonly driverRepo:  Repository<Driver>,
    @InjectRepository(Client)  private readonly clientRepo:  Repository<Client>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(User)    private readonly userRepo:    Repository<User>,
    private readonly gpsService:           GpsService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService:         AuditService,
    private readonly dataSource:           DataSource,
  ) {}

  // ── Stats ──────────────────────────────────────────────────────────────────
  async getStats(): Promise<DashboardStats> {
    const [
      totalRides, completedRides, cancelledRides,
      activeDrivers, pendingDrivers, totalClients, totalCompanies,
    ] = await Promise.all([
      this.rideRepo.count(),
      this.rideRepo.count({ where: { status: RideStatus.COMPLETED } }),
      this.rideRepo.count({ where: { status: RideStatus.CANCELLED } }),
      this.driverRepo.count({ where: { isApproved: true } }),
      this.driverRepo.count({ where: { isApproved: false } }),
      this.clientRepo.count(),
      this.companyRepo.count(),
    ]);
    return { totalRides, completedRides, cancelledRides, activeDrivers, pendingDrivers, totalClients, totalCompanies };
  }

  // ── Drivers ────────────────────────────────────────────────────────────────
  async getDrivers(filter: 'all' | 'pending' | 'approved', page: number, limit: number, search?: string) {
    const where: FindOptionsWhere<Driver> = {};
    if (filter === 'pending')  where.isApproved = false;
    if (filter === 'approved') where.isApproved = true;

    let drivers: Driver[];
    let total: number;

    if (search) {
      const [byPlate, byName, cnt] = await Promise.all([
        this.driverRepo.find({ where: { ...where, vehiclePlate: Like(`%${search}%`) }, take: limit }),
        this.driverRepo.find({ where: { ...where, lastName:     Like(`%${search}%`) }, take: limit }),
        this.driverRepo.count({ where }),
      ]);
      const seen = new Set<string>();
      drivers = [...byPlate, ...byName].filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
      total = cnt;
    } else {
      [drivers, total] = await this.driverRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    }

    // Enrich with phone numbers (batch load from users table)
    const phoneMap = await this.buildPhoneMap(drivers.map(d => d.userId));
    return { drivers: drivers.map(d => this.mapDriver(d, phoneMap.get(d.userId))), total };
  }

  async approveDriver(adminUserId: string, adminPhone: string | null, driverId: string) {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.isApproved) throw new BadRequestException('Driver is already approved');

    await this.driverRepo.update(driverId, { isApproved: true });

    // Notify the driver via FCM
    const user = await this.userRepo.findOne({ where: { id: driver.userId } });
    if (user?.fcmToken) {
      void this.notificationsService.sendToToken(user.fcmToken, {
        title: '✅ Llogaria u miratua!',
        body:  'Llogaria juaj e shoferit u miratua. Tani mund të dilni online dhe të pranoni udhëtime.',
        data:  { event: 'account_approved' },
      });
    }

    void this.auditService.log({
      adminId: adminUserId, adminPhone,
      action: 'driver.approved', targetType: 'driver', targetId: driverId,
    });

    return { message: 'Driver approved successfully' };
  }

  async rejectDriver(adminUserId: string, adminPhone: string | null, driverId: string, reason?: string) {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');

    // Deactivate the user account and mark driver as not approved
    await Promise.all([
      this.userRepo.update({ id: driver.userId }, { isActive: false }),
      this.driverRepo.update(driverId, { isApproved: false }),
    ]);

    // Notify the driver via FCM with the optional rejection reason
    const user = await this.userRepo.findOne({ where: { id: driver.userId } });
    if (user?.fcmToken) {
      void this.notificationsService.sendToToken(user.fcmToken, {
        title: '❌ Aplikimi nuk u miratua',
        body:  reason
          ? `Aplikimi juaj si shofer nuk u miratua. Arsyeja: ${reason}`
          : 'Aplikimi juaj si shofer nuk u miratua. Ju lutemi kontaktoni mbështetjen për detaje.',
        data:  { event: 'account_rejected', reason: reason ?? '' },
      });
    }

    void this.auditService.log({
      adminId: adminUserId, adminPhone,
      action: 'driver.rejected', targetType: 'driver', targetId: driverId,
      metadata: reason ? { reason } : null,
    });

    return { message: 'Driver rejected and account deactivated' };
  }

  /** Batch-load phone numbers for a list of userIds */
  private async buildPhoneMap(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
      select: ['id', 'phone'],
    });
    return new Map(users.map(u => [u.id, u.phone ?? ''] as [string, string]));
  }

  private mapDriver(d: Driver, phone?: string) {
    const offered = d.totalAccepted + d.totalDeclined;
    return {
      id:              d.id,
      userId:          d.userId,
      companyId:       d.companyId,
      phone:           phone ?? null,
      firstName:       d.firstName,
      lastName:        d.lastName,
      licenseNumber:   d.licenseNumber,
      vehicleMake:     d.vehicleMake,
      vehicleModel:    d.vehicleModel,
      vehicleYear:     d.vehicleYear,
      vehiclePlate:    d.vehiclePlate,
      vehicleColor:    d.vehicleColor,
      isApproved:      d.isApproved,
      isOnline:        d.isOnline,
      rating:          Number(d.rating),
      totalRides:      d.totalRides,
      totalAccepted:   d.totalAccepted,
      totalDeclined:   d.totalDeclined,
      acceptanceRate:  offered > 0 ? Math.round((d.totalAccepted / offered) * 1000) / 10 : null,
      createdAt:       d.createdAt,
    };
  }

  // ── Clients ────────────────────────────────────────────────────────────────
  async getClients(page: number, limit: number, search?: string) {
    let clients: Client[];
    let total: number;

    if (search) {
      // Also match on the user's phone/email so admins can look up a
      // passenger by contact details, not just name.
      const matchedUsers = await this.userRepo.find({
        where: [
          { phone: Like(`%${search}%`), role: UserRole.CLIENT },
          { email: Like(`%${search}%`), role: UserRole.CLIENT },
        ],
        select: ['id'],
      });
      const where: FindOptionsWhere<Client>[] = [
        { firstName: Like(`%${search}%`) },
        { lastName:  Like(`%${search}%`) },
      ];
      if (matchedUsers.length > 0) {
        where.push({ userId: In(matchedUsers.map(u => u.id)) });
      }
      const results = await this.clientRepo.find({
        where,
        order: { createdAt: 'DESC' },
        take: limit,
      });
      clients = results;
      total   = results.length;
    } else {
      [clients, total] = await this.clientRepo.findAndCount({
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    }

    const userMap = await this.buildClientUserMap(clients.map(c => c.userId));
    return { clients: clients.map(c => this.mapClient(c, userMap.get(c.userId))), total };
  }

  private async buildClientUserMap(userIds: string[]): Promise<Map<string, User>> {
    if (userIds.length === 0) return new Map();
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
      select: ['id', 'phone', 'email', 'isPhoneVerified', 'isActive'],
    });
    return new Map(users.map(u => [u.id, u] as [string, User]));
  }

  private mapClient(c: Client, user?: User) {
    return {
      id:              c.id,
      userId:          c.userId,
      phone:           user?.phone ?? null,
      email:           user?.email ?? null,
      isPhoneVerified: user?.isPhoneVerified ?? false,
      isActive:        user?.isActive ?? true,
      firstName:       c.firstName,
      lastName:        c.lastName,
      photoUrl:        c.photoUrl,
      rating:          Number(c.rating),
      totalRides:      c.totalRides,
      createdAt:       c.createdAt,
    };
  }

  /**
   * Full detail for a single passenger (client), for the admin drawer:
   * profile + account (phone/email/verified/active), how they registered
   * (Google / Apple / phone), and their most recent rides.
   */
  async getClientDetail(clientId: string) {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Passenger not found');

    const user = await this.userRepo.findOne({
      where: { id: client.userId },
      select: [
        'id', 'phone', 'email', 'isPhoneVerified', 'isActive',
        'googleSub', 'appleSub', 'createdAt',
      ],
    });

    const recentRides = await this.rideRepo.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const authProvider: 'google' | 'apple' | 'phone' =
      user?.googleSub ? 'google' : user?.appleSub ? 'apple' : 'phone';

    return {
      id:              client.id,
      userId:          client.userId,
      firstName:       client.firstName,
      lastName:        client.lastName,
      photoUrl:        client.photoUrl,
      rating:          Number(client.rating),
      totalRides:      client.totalRides,
      createdAt:       client.createdAt,
      phone:           user?.phone ?? null,
      email:           user?.email ?? null,
      isPhoneVerified: user?.isPhoneVerified ?? false,
      isActive:        user?.isActive ?? true,
      authProvider,
      accountCreatedAt: user?.createdAt ?? null,
      recentRides: recentRides.map(r => ({
        id:            r.id,
        status:        r.status,
        pickupAddress: r.pickupAddress,
        dropoffAddress: r.dropoffAddress,
        totalFare:     r.totalFare != null ? Number(r.totalFare) : null,
        paymentStatus: r.paymentStatus,
        createdAt:     r.createdAt,
      })),
    };
  }

  // ── Companies ─────────────────────────────────────────────────────────────
  async getCompanies(filter: 'all' | 'pending' | 'approved', page: number, limit: number) {
    const where: FindOptionsWhere<Company> = {};
    if (filter === 'pending')  where.isApproved = false;
    if (filter === 'approved') where.isApproved = true;
    const [companies, total] = await this.companyRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const phoneMap = await this.buildPhoneMap(companies.map(c => c.userId));
    return { companies: companies.map(c => this.mapCompany(c, phoneMap.get(c.userId))), total };
  }

  async approveCompany(adminUserId: string, adminPhone: string | null, companyId: string) {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    if (company.isApproved) throw new BadRequestException('Company is already approved');
    await this.companyRepo.update(companyId, { isApproved: true, approvedAt: new Date() });

    void this.auditService.log({
      adminId: adminUserId, adminPhone,
      action: 'company.approved', targetType: 'company', targetId: companyId,
    });

    return { message: 'Company approved successfully' };
  }

  async rejectCompany(adminUserId: string, adminPhone: string | null, companyId: string) {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    await this.userRepo.update({ id: company.userId }, { isActive: false });
    await this.companyRepo.update(companyId, { isApproved: false });

    void this.auditService.log({
      adminId: adminUserId, adminPhone,
      action: 'company.rejected', targetType: 'company', targetId: companyId,
    });

    return { message: 'Company rejected and account deactivated' };
  }

  private mapCompany(c: Company, phone?: string) {
    return {
      id:         c.id,
      userId:     c.userId,
      phone:      phone ?? null,
      name:       c.name,
      address:    c.address,
      city:       c.city,
      isApproved: c.isApproved,
      approvedAt: c.approvedAt,
      createdAt:  c.createdAt,
    };
  }

  // ── Rides ──────────────────────────────────────────────────────────────────
  async getRides(status: RideStatus | 'all', page: number, limit: number) {
    const where: FindOptionsWhere<Ride> = status !== 'all' ? { status } : {};
    const [rides, total] = await this.rideRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    // Attach the passenger (client) who made each request, so the admin rides
    // table can show who booked without a per-row lookup.
    const clientMap = await this.buildRideClientMap(rides.map(r => r.clientId));
    return { rides: rides.map(r => this.mapRide(r, clientMap.get(r.clientId))), total };
  }

  /** Map ride clientId → { name, phone } for a page of rides, in two queries. */
  private async buildRideClientMap(
    clientIds: string[],
  ): Promise<Map<string, { id: string; name: string; phone: string | null }>> {
    const ids = [...new Set(clientIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const clients = await this.clientRepo.find({
      where: { id: In(ids) },
      select: ['id', 'userId', 'firstName', 'lastName'],
    });
    const userMap = await this.buildClientUserMap(clients.map(c => c.userId));
    return new Map(
      clients.map(c => [
        c.id,
        {
          id:    c.id,
          name:  `${c.firstName} ${c.lastName}`.trim() || '—',
          phone: userMap.get(c.userId)?.phone ?? null,
        },
      ]),
    );
  }

  // ── Analytics ──────────────────────────────────────────────────────────────
  async getAnalytics(days: number) {
    // Rides per day with status breakdown — raw SQL for date truncation
    const ridesPerDay: Array<{ date: string; total: string; completed: string; cancelled: string }> =
      await this.rideRepo.query(
        `SELECT
           TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
           COUNT(*)                                               AS total,
           COUNT(*) FILTER (WHERE status = 'completed')          AS completed,
           COUNT(*) FILTER (WHERE status = 'cancelled')          AS cancelled
         FROM rides
         WHERE created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE_TRUNC('day', created_at)
         ORDER BY DATE_TRUNC('day', created_at) ASC`,
      );

    // Overall status breakdown for pie chart
    const breakdown: Array<{ status: string; count: string }> = await this.rideRepo.query(
      `SELECT status, COUNT(*) AS count FROM rides GROUP BY status`,
    );

    // Top 5 drivers by completed rides
    const topDrivers: Array<{ firstName: string; lastName: string; vehiclePlate: string; rides: string; rating: string }> =
      await this.driverRepo.query(
        `SELECT d.first_name AS "firstName", d.last_name AS "lastName",
                d.vehicle_plate AS "vehiclePlate",
                COUNT(r.id) AS rides, d.rating
         FROM drivers d
         LEFT JOIN rides r ON r.driver_id = d.id AND r.status = 'completed'
         GROUP BY d.id
         ORDER BY COUNT(r.id) DESC
         LIMIT 5`,
      );

    return {
      ridesPerDay: ridesPerDay.map(r => ({
        date:      r.date,
        total:     Number(r.total),
        completed: Number(r.completed),
        cancelled: Number(r.cancelled),
      })),
      statusBreakdown: breakdown.map(b => ({
        status: b.status,
        count:  Number(b.count),
      })),
      topDrivers: topDrivers.map(d => ({
        name:  `${d.firstName} ${d.lastName}`,
        plate: d.vehiclePlate,
        rides: Number(d.rides),
        rating: Number(d.rating),
      })),
    };
  }

  // ── Live driver monitor ────────────────────────────────────────────────────
  async getLiveDrivers() {
    // 1. Redis — freshest GPS data (only present after first gps_update)
    const locations = await this.gpsService.getAllOnlineDriverLocations();
    const locMap    = new Map(locations.map(l => [l.driverId, l]));

    // 2. DB — all drivers currently marked isOnline=true (set on driver_online event)
    const onlineDrivers = await this.driverRepo.find({
      where:  { isOnline: true },
      select: ['id', 'firstName', 'lastName', 'vehiclePlate', 'vehicleMake', 'vehicleModel', 'vehicleColor', 'currentLat', 'currentLng', 'lastLocationAt'],
    });

    // 3. Merge: union of both sources
    const allIds = new Set([
      ...onlineDrivers.map(d => d.id),
      ...locations.map(l => l.driverId),
    ]);

    if (allIds.size === 0) return [];

    // Fetch profile info for Redis-only drivers (not in DB online set)
    const dbIds        = new Set(onlineDrivers.map(d => d.id));
    const redisOnlyIds = locations.map(l => l.driverId).filter(id => !dbIds.has(id));
    let extraDrivers: typeof onlineDrivers = [];
    if (redisOnlyIds.length > 0) {
      extraDrivers = await this.driverRepo.find({
        where:  { id: In(redisOnlyIds) },
        select: ['id', 'firstName', 'lastName', 'vehiclePlate', 'vehicleMake', 'vehicleModel', 'vehicleColor', 'currentLat', 'currentLng', 'lastLocationAt'],
      });
    }

    const driverMap = new Map(
      [...onlineDrivers, ...extraDrivers].map(d => [d.id, d]),
    );

    return [...allIds].map(driverId => {
      const d   = driverMap.get(driverId);
      const loc = locMap.get(driverId);

      // Prefer live Redis coordinates; fall back to last DB-persisted position
      const lat        = loc?.lat      ?? (d?.currentLat      != null ? Number(d.currentLat)  : 0);
      const lng        = loc?.lng      ?? (d?.currentLng      != null ? Number(d.currentLng)  : 0);
      const lastSeenMs = loc?.ts       ?? (d?.lastLocationAt  != null ? d.lastLocationAt.getTime() : 0);

      return {
        driverId,
        lat,
        lng,
        lastSeenMs,
        firstName:    d?.firstName    ?? 'Unknown',
        lastName:     d?.lastName     ?? '',
        vehiclePlate: d?.vehiclePlate ?? '—',
        vehicleMake:  d?.vehicleMake  ?? '',
        vehicleModel: d?.vehicleModel ?? '',
        vehicleColor: d?.vehicleColor ?? null,
      };
    });
  }

  // ── Observability metrics ──────────────────────────────────────────────────
  async getMetrics() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      onlineDrivers,
      pendingRides,
      activeRides,
      ridesToday,
      openTickets,
      totalUsers,
      revenueToday,
    ] = await Promise.all([
      this.driverRepo.count({ where: { isOnline: true } }),
      this.rideRepo.count({ where: { status: RideStatus.REQUESTED } }),
      this.rideRepo.count({ where: { status: RideStatus.IN_PROGRESS } }),
      this.rideRepo.count({ where: { status: RideStatus.COMPLETED } }),
      // open support tickets
      this.dataSource.query<[{ cnt: string }]>(
        `SELECT COUNT(*) AS cnt FROM support_tickets WHERE status = 'open'`,
      ),
      this.userRepo.count(),
      // revenue from completed rides today
      this.dataSource.query<[{ total: string | null }]>(
        `SELECT COALESCE(SUM(total_fare), 0) AS total
         FROM rides
         WHERE status = 'completed' AND completed_at >= $1`,
        [todayStart],
      ),
    ]);

    const mem = process.memoryUsage();
    const mb  = (b: number) => Math.round(b / 1024 / 1024);

    return {
      realtime: {
        onlineDrivers,
        pendingRides,
        activeRides,
        openSupportTickets: Number(openTickets[0]?.cnt ?? 0),
      },
      today: {
        completedRides: ridesToday,
        revenueAmount:  Number(revenueToday[0]?.total ?? 0),
      },
      totals: {
        users: totalUsers,
      },
      system: {
        uptimeSeconds:  Math.floor(process.uptime()),
        heapUsedMb:     mb(mem.heapUsed),
        heapTotalMb:    mb(mem.heapTotal),
        rssMb:          mb(mem.rss),
        nodeVersion:    process.version,
        env:            process.env.NODE_ENV ?? 'development',
      },
      collectedAt: new Date().toISOString(),
    };
  }

  private mapRide(
    r: Ride,
    client?: { id: string; name: string; phone: string | null },
  ) {
    return {
      id:             r.id,
      status:         r.status,
      clientId:       r.clientId,
      clientName:     client?.name  ?? null,
      clientPhone:    client?.phone ?? null,
      driverId:       r.driverId,
      pickupAddress:  r.pickupAddress,
      dropoffAddress: r.dropoffAddress,
      pickupLat:      Number(r.pickupLat),
      pickupLng:      Number(r.pickupLng),
      paymentStatus:  r.paymentStatus,
      cancelReason:   r.cancelReason,
      driverRating:   r.driverRating,
      clientRating:   r.clientRating,
      totalFare:      r.totalFare      != null ? Number(r.totalFare)      : null,
      discountAmount: r.discountAmount != null ? Number(r.discountAmount) : null,
      promoCode:      r.promoCode,
      createdAt:      r.createdAt,
      completedAt:    r.completedAt,
      cancelledAt:    r.cancelledAt,
    };
  }
}

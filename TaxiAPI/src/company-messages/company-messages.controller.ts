/**
 * Two-way chat between a company and its drivers.
 *
 * Both /company/messages/* and /driver/messages/* live in this controller —
 * easier than splitting because the data model is symmetric. Auth + role
 * guards gate which endpoints each role can hit, and we always resolve the
 * caller's own company/driver record to scope the query.
 */
import {
  Body, Controller, Get, HttpCode, HttpStatus, NotFoundException,
  Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { In, IsNull, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import {
  Company, CompanyMessage, Driver, User,
} from '../entities';
import { CompanyMessageFromRole } from '../entities/company-message.entity';
import { GatewayService } from '../gateway/gateway.service';
import { NotificationsService } from '../notifications/notifications.service';

class SendMessageDto {
  @IsString() @IsNotEmpty() @MaxLength(2000)
  text: string;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyMessagesController {
  constructor(
    @InjectRepository(CompanyMessage) private readonly msgRepo: Repository<CompanyMessage>,
    @InjectRepository(Company)        private readonly companyRepo: Repository<Company>,
    @InjectRepository(Driver)         private readonly driverRepo:  Repository<Driver>,
    @InjectRepository(User)           private readonly userRepo:    Repository<User>,
    private readonly gatewayService: GatewayService,
    private readonly notifications:  NotificationsService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // COMPANY endpoints
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /company/messages/threads
   * One row per driver in the company, with last message + unread count.
   */
  @Get('company/messages/threads')
  @Roles(UserRole.COMPANY)
  async listThreads(@CurrentUser() user: User) {
    const company = await this.companyRepo.findOne({ where: { userId: user.id } });
    if (!company) throw new NotFoundException('Company profile not found');

    const drivers = await this.driverRepo.find({
      where: { companyId: company.id },
      select: ['id', 'userId', 'firstName', 'lastName', 'vehiclePlate'],
    });
    if (drivers.length === 0) return [];

    const driverIds = drivers.map(d => d.id);

    // Last message per driver — small enough volume to fetch + group in memory.
    const recent = await this.msgRepo.find({
      where: { companyId: company.id, driverId: In(driverIds) },
      order: { createdAt: 'DESC' },
    });
    const lastByDriver = new Map<string, CompanyMessage>();
    for (const m of recent) {
      if (!lastByDriver.has(m.driverId)) lastByDriver.set(m.driverId, m);
    }

    // Unread = messages from driver that the company hasn't read yet.
    const unreadRows = await this.msgRepo
      .createQueryBuilder('m')
      .select('m.driver_id', 'driverId')
      .addSelect('COUNT(*)', 'count')
      .where('m.company_id = :cid', { cid: company.id })
      .andWhere('m.from_role = :role', { role: CompanyMessageFromRole.DRIVER })
      .andWhere('m.read_at IS NULL')
      .groupBy('m.driver_id')
      .getRawMany<{ driverId: string; count: string }>();
    const unreadByDriver = new Map(unreadRows.map(r => [r.driverId, Number(r.count)]));

    return drivers.map(d => {
      const last = lastByDriver.get(d.id) ?? null;
      return {
        driverId:      d.id,
        firstName:     d.firstName,
        lastName:      d.lastName,
        vehiclePlate:  d.vehiclePlate,
        unreadCount:   unreadByDriver.get(d.id) ?? 0,
        lastMessage:   last ? this.mapMessage(last) : null,
      };
    }).sort((a, b) => {
      // Sort: any unread first, then most-recent activity, then alpha.
      if ((b.unreadCount > 0 ? 1 : 0) !== (a.unreadCount > 0 ? 1 : 0)) {
        return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
      }
      const aTs = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTs = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      if (bTs !== aTs) return bTs - aTs;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }

  /** GET /company/messages/with/:driverId — full thread, newest last. */
  @Get('company/messages/with/:driverId')
  @Roles(UserRole.COMPANY)
  async companyThread(
    @CurrentUser() user: User,
    @Param('driverId', new ParseUUIDPipe()) driverId: string,
  ) {
    const company = await this.companyRepo.findOne({ where: { userId: user.id } });
    if (!company) throw new NotFoundException('Company profile not found');

    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver || driver.companyId !== company.id) {
      throw new NotFoundException('Driver not found');
    }

    const messages = await this.msgRepo.find({
      where: { companyId: company.id, driverId },
      order: { createdAt: 'ASC' },
      take: 500,
    });

    // Mark all driver-sent messages as read by the company.
    await this.msgRepo.update(
      { companyId: company.id, driverId, fromRole: CompanyMessageFromRole.DRIVER, readAt: IsNull() },
      { readAt: new Date() },
    );

    return messages.map(m => this.mapMessage(m));
  }

  /** POST /company/messages/to/:driverId — company sends a message to one driver. */
  @Post('company/messages/to/:driverId')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.COMPANY)
  async companySend(
    @CurrentUser() user: User,
    @Param('driverId', new ParseUUIDPipe()) driverId: string,
    @Body() dto: SendMessageDto,
  ) {
    const company = await this.companyRepo.findOne({ where: { userId: user.id } });
    if (!company) throw new NotFoundException('Company profile not found');

    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver || driver.companyId !== company.id) {
      throw new NotFoundException('Driver not found');
    }

    const msg = await this.msgRepo.save(this.msgRepo.create({
      companyId: company.id,
      driverId:  driver.id,
      fromRole:  CompanyMessageFromRole.COMPANY,
      text:      dto.text.trim(),
    }));

    // Realtime delivery to the driver. Push fallback for offline.
    const dto2 = this.mapMessage(msg);
    this.gatewayService.emitToUser(driver.userId, 'company_message', dto2);
    void this.pushToDriver(driver.userId, company.name ?? 'Company', dto.text.trim(), dto2);

    return dto2;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DRIVER endpoints
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /driver/messages/thread
   * Driver has at most one company → one thread. Returns the messages
   * and the company name. Also marks any company-sent messages as read.
   */
  @Get('driver/messages/thread')
  @Roles(UserRole.DRIVER)
  async driverThread(@CurrentUser() user: User) {
    const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (!driver.companyId) {
      return { companyId: null, companyName: null, messages: [], unreadCount: 0 };
    }

    const company = await this.companyRepo.findOne({
      where: { id: driver.companyId },
      select: ['id', 'name'],
    });

    const messages = await this.msgRepo.find({
      where: { companyId: driver.companyId, driverId: driver.id },
      order: { createdAt: 'ASC' },
      take: 500,
    });

    await this.msgRepo.update(
      {
        companyId: driver.companyId,
        driverId:  driver.id,
        fromRole:  CompanyMessageFromRole.COMPANY,
        readAt:    IsNull(),
      },
      { readAt: new Date() },
    );

    return {
      companyId:   driver.companyId,
      companyName: company?.name ?? null,
      messages:    messages.map(m => this.mapMessage(m)),
      unreadCount: 0,
    };
  }

  /** GET /driver/messages/unread-count — for the bell badge. */
  @Get('driver/messages/unread-count')
  @Roles(UserRole.DRIVER)
  async driverUnreadCount(@CurrentUser() user: User) {
    const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
    if (!driver || !driver.companyId) return { count: 0 };

    const count = await this.msgRepo.count({
      where: {
        companyId: driver.companyId,
        driverId:  driver.id,
        fromRole:  CompanyMessageFromRole.COMPANY,
        readAt:    IsNull(),
      },
    });
    return { count };
  }

  /** POST /driver/messages/reply — driver sends to their company. */
  @Post('driver/messages/reply')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.DRIVER)
  async driverReply(
    @CurrentUser() user: User,
    @Body() dto: SendMessageDto,
  ) {
    const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (!driver.companyId) {
      throw new NotFoundException('You are not assigned to a company');
    }

    const msg = await this.msgRepo.save(this.msgRepo.create({
      companyId: driver.companyId,
      driverId:  driver.id,
      fromRole:  CompanyMessageFromRole.DRIVER,
      text:      dto.text.trim(),
    }));

    // Notify the company's owner user via WS. (Companies don't have a
    // background app yet so we skip push for now — they'll see it next
    // time they open their app or dashboard.)
    const company = await this.companyRepo.findOne({
      where: { id: driver.companyId },
      select: ['id', 'userId'],
    });
    const dto2 = this.mapMessage(msg);
    if (company) {
      this.gatewayService.emitToUser(company.userId, 'company_message', dto2);
    }
    return dto2;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async pushToDriver(
    driverUserId: string, companyName: string, body: string,
    payload: ReturnType<typeof this.mapMessage>,
  ): Promise<void> {
    const u = await this.userRepo.findOne({
      where: { id: driverUserId },
      select: ['fcmToken'],
    });
    if (!u?.fcmToken) return;
    await this.notifications.sendToToken(u.fcmToken, {
      title: `Message from ${companyName}`,
      body:  body.length > 140 ? `${body.slice(0, 137)}...` : body,
      data: {
        type:    'company_message',
        msgId:   payload.id,
        driverId: payload.driverId,
      },
    });
  }

  private mapMessage(m: CompanyMessage) {
    return {
      id:         m.id,
      companyId:  m.companyId,
      driverId:   m.driverId,
      fromRole:   m.fromRole,
      text:       m.text,
      readAt:     m.readAt,
      createdAt:  m.createdAt,
    };
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdminNotification,
  AdminNotificationType,
  User,
} from '../entities/index.js';
import { UserRole } from '../common/enums/index.js';
import { NotificationsService } from './notifications.service.js';

export interface RegisteredUserInfo {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
}

/**
 * Persistent notification feed for super-admins + FCM fan-out to their
 * mobile apps. The DB row is the durable record — some users register and
 * delete their account minutes later, and the admin still needs to know
 * who they were.
 */
@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    @InjectRepository(AdminNotification)
    private readonly notificationRepo: Repository<AdminNotification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Record a "new user registered" notification and push it to every
   * super-admin's device. Never throws — a notification failure must not
   * break registration.
   */
  async notifyUserRegistered(info: RegisteredUserInfo): Promise<void> {
    try {
      const fullName = `${info.firstName} ${info.lastName}`.trim();
      const contact = info.phone ?? info.email ?? 'no contact info';
      const roleLabel = this.roleLabel(info.role);

      const title = `Regjistrim i ri: ${roleLabel}`;
      const bodyParts = [fullName, info.phone, info.email].filter(
        (s): s is string => !!s,
      );
      const body = bodyParts.join(' · ');

      await this.notificationRepo.save(
        this.notificationRepo.create({
          type: AdminNotificationType.USER_REGISTERED,
          title,
          body,
          data: {
            userId: info.userId,
            firstName: info.firstName,
            lastName: info.lastName,
            phone: info.phone,
            email: info.email,
            role: info.role,
          },
        }),
      );

      this.logger.log(
        `Admin notification saved: new ${roleLabel} ${fullName} (${contact})`,
      );

      // FCM fan-out to every admin device — fire in parallel, errors are
      // swallowed inside sendToToken.
      const admins = await this.userRepo.find({
        where: { role: UserRole.SUPER_ADMIN, isActive: true },
        select: ['id', 'fcmToken'],
      });
      await Promise.all(
        admins
          .filter((a) => a.fcmToken)
          .map((a) =>
            this.notifications.sendToToken(a.fcmToken, {
              title: `🆕 ${title}`,
              body,
              data: { event: 'admin_user_registered', role: info.role },
            }),
          ),
      );
    } catch (err) {
      this.logger.error(
        `notifyUserRegistered failed (registration itself is unaffected): ${err}`,
      );
    }
  }

  // ── Feed queries (dashboard bell) ──────────────────────────────────────────

  async list(limit = 20, offset = 0) {
    const [items, total] = await this.notificationRepo.findAndCount({
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
      skip: offset,
    });
    return { items, total };
  }

  async unreadCount(): Promise<{ count: number }> {
    const count = await this.notificationRepo.count({
      where: { isRead: false },
    });
    return { count };
  }

  async markRead(id: string): Promise<AdminNotification> {
    const notification = await this.notificationRepo.findOne({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (!notification.isRead) {
      notification.isRead = true;
      await this.notificationRepo.save(notification);
    }
    return notification;
  }

  async markAllRead(): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update(
      { isRead: false },
      { isRead: true },
    );
    return { updated: result.affected ?? 0 };
  }

  private roleLabel(role: UserRole): string {
    switch (role) {
      case UserRole.CLIENT:
        return 'pasagjer';
      case UserRole.DRIVER:
        return 'shofer';
      case UserRole.COMPANY:
        return 'kompani';
      default:
        return 'përdorues';
    }
  }
}

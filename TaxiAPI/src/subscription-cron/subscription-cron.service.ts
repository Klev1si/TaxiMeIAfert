import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Company,
  CompanySubscription,
  Driver,
  DriverSubscription,
  SubscriptionNotification,
  User,
} from '../entities/index.js';
import { SubscriptionNotificationType } from '../entities/subscription-notification.entity.js';
import { SubscriptionStatus } from '../common/enums/index.js';
import { GRACE_PERIOD_DAYS } from '../common/subscription-state.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { SmsService } from '../sms/sms.service.js';

interface OffsetRule {
  /** floor((periodEnd - now) / day). Negative = past expiry. */
  daysOffset: number;
  type:       SubscriptionNotificationType;
  title:      string;
  body:       string;
}

/** When each notification should fire, relative to currentPeriodEnd. */
const RULES: OffsetRule[] = [
  { daysOffset:  7, type: SubscriptionNotificationType.REMINDER_7D,
    title: 'Abonimi skadon për 7 ditë',
    body:  'Abonimi juaj do të përfundojë për 7 ditë. Rinovoni tani për të shmangur ndërprerjen.' },
  { daysOffset:  3, type: SubscriptionNotificationType.REMINDER_3D,
    title: 'Abonimi skadon për 3 ditë',
    body:  'Abonimi juaj do të përfundojë për 3 ditë. Rinovoni tani për të vazhduar punën.' },
  { daysOffset:  1, type: SubscriptionNotificationType.REMINDER_1D,
    title: 'Abonimi skadon nesër',
    body:  'Kujtesa e fundit — rinovoni sot që të mos bllokoheni.' },
  { daysOffset:  0, type: SubscriptionNotificationType.EXPIRED,
    title: 'Abonimi skadoi — filloi periudha e faljes',
    body:  `Abonimi juaj ka skaduar. Keni ${GRACE_PERIOD_DAYS} ditë falje për ta rinovuar para se aksesi të bllokohet.` },
  { daysOffset: -GRACE_PERIOD_DAYS, type: SubscriptionNotificationType.GRACE_END_BLOCKED,
    title: 'Llogaria u bllokua — rinovoni për të vazhduar',
    body:  'Periudha juaj e faljes ka mbaruar. Rinovoni abonimin për të filluar sërish pranimin e udhëtimeve.' },
];

/**
 * Daily reminder job for subscription lifecycle events.
 *
 * Runs at 09:00 every day. For each active driver / company subscription,
 * computes how many days remain until period end and sends the matching
 * reminder via push, email, and SMS — deduped via subscription_notifications.
 */
@Injectable()
export class SubscriptionCronService {
  private readonly logger = new Logger(SubscriptionCronService.name);

  constructor(
    @InjectRepository(DriverSubscription)
    private readonly driverSubRepo: Repository<DriverSubscription>,

    @InjectRepository(CompanySubscription)
    private readonly companySubRepo: Repository<CompanySubscription>,

    @InjectRepository(SubscriptionNotification)
    private readonly notifLedger: Repository<SubscriptionNotification>,

    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,

    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly notifications: NotificationsService,
    private readonly mailer:        MailerService,
    private readonly sms:           SmsService,
  ) {}

  /** Run daily at 09:00 server time. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDaily(): Promise<void> {
    this.logger.log('Subscription reminder job: starting');
    try {
      const driverCount  = await this.processDriverSubs();
      const companyCount = await this.processCompanySubs();
      this.logger.log(
        `Subscription reminder job: sent driver=${driverCount}, company=${companyCount}`,
      );
    } catch (err: any) {
      this.logger.error(`Subscription reminder job failed: ${err.message}`, err.stack);
    }
  }

  // ── Per-audience processing ────────────────────────────────────────────────

  private async processDriverSubs(): Promise<number> {
    let sent = 0;
    const subs = await this.driverSubRepo.find({
      where: [
        { status: SubscriptionStatus.ACTIVE },
        { status: SubscriptionStatus.TRIALING },
        { status: SubscriptionStatus.PAST_DUE },
      ],
    });

    for (const sub of subs) {
      const rule = this.matchRule(sub.currentPeriodEnd);
      if (!rule) continue;
      if (await this.alreadySent(sub.id, sub.currentPeriodEnd, rule.type)) continue;

      const user = await this.lookupDriverUser(sub.driverId);
      if (!user) continue;

      await this.deliver(user, rule);
      await this.recordSent(sub.id, 'driver', sub.currentPeriodEnd, rule.type);
      sent++;
    }
    return sent;
  }

  private async processCompanySubs(): Promise<number> {
    let sent = 0;
    const subs = await this.companySubRepo.find({
      where: [
        { status: SubscriptionStatus.ACTIVE },
        { status: SubscriptionStatus.TRIALING },
        { status: SubscriptionStatus.PAST_DUE },
      ],
    });

    for (const sub of subs) {
      const rule = this.matchRule(sub.currentPeriodEnd);
      if (!rule) continue;
      if (await this.alreadySent(sub.id, sub.currentPeriodEnd, rule.type)) continue;

      const user = await this.lookupCompanyUser(sub.companyId);
      if (!user) continue;

      await this.deliver(user, rule);
      await this.recordSent(sub.id, 'company', sub.currentPeriodEnd, rule.type);
      sent++;
    }
    return sent;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private matchRule(periodEnd: Date): OffsetRule | null {
    const dayMs = 24 * 60 * 60 * 1000;
    const diffMs = new Date(periodEnd).getTime() - Date.now();
    const days   = Math.floor(diffMs / dayMs);
    return RULES.find((r) => r.daysOffset === days) ?? null;
  }

  private async alreadySent(
    subscriptionId: string,
    periodEnd: Date,
    type: SubscriptionNotificationType,
  ): Promise<boolean> {
    const existing = await this.notifLedger.findOne({
      where: { subscriptionId, periodEnd, type },
    });
    return Boolean(existing);
  }

  private async recordSent(
    subscriptionId: string,
    kind: 'driver' | 'company',
    periodEnd: Date,
    type: SubscriptionNotificationType,
  ): Promise<void> {
    try {
      await this.notifLedger.save(
        this.notifLedger.create({ subscriptionId, subscriptionKind: kind, periodEnd, type }),
      );
    } catch (err: any) {
      // Likely a unique-constraint race — safe to ignore (means already sent)
      this.logger.debug(`recordSent skipped: ${err.message}`);
    }
  }

  private async lookupDriverUser(driverId: string): Promise<User | null> {
    const driver = await this.driverRepo.findOne({
      where:  { id: driverId },
      select: ['id', 'userId'],
    });
    if (!driver) return null;
    return this.userRepo.findOne({
      where:  { id: driver.userId },
      select: ['id', 'email', 'phone', 'fcmToken'],
    });
  }

  private async lookupCompanyUser(companyId: string): Promise<User | null> {
    const company = await this.companyRepo.findOne({
      where:  { id: companyId },
      select: ['id', 'userId'],
    });
    if (!company) return null;
    return this.userRepo.findOne({
      where:  { id: company.userId },
      select: ['id', 'email', 'phone', 'fcmToken'],
    });
  }

  private async deliver(user: User, rule: OffsetRule): Promise<void> {
    // FCM push
    await this.notifications.sendToToken(user.fcmToken, {
      title: rule.title,
      body:  rule.body,
      data:  { event: 'subscription_reminder', type: rule.type },
    });

    // Email
    if (user.email) {
      const html = `<p>Hello,</p>
<p>${this.escape(rule.body)}</p>
<p>— TaxiApp</p>`;
      await this.mailer.sendPlain(user.email, rule.title, html);
    }

    // SMS
    if (user.phone) {
      await this.sms.send(user.phone, `${rule.title}\n${rule.body}`);
    }
  }

  private escape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

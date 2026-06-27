import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** Which lifecycle event we sent a reminder for. */
export enum SubscriptionNotificationType {
  REMINDER_7D = 'reminder_7d',
  REMINDER_3D = 'reminder_3d',
  REMINDER_1D = 'reminder_1d',
  EXPIRED = 'expired',
  GRACE_END_BLOCKED = 'grace_end_blocked',
}

/**
 * Dedupe ledger for subscription lifecycle notifications.
 * One row per (subscription, period_end, type) ensures we never send
 * the same reminder twice — survives cron retries / restarts.
 */
@Entity('subscription_notifications')
@Unique('uq_sub_notification', ['subscriptionId', 'periodEnd', 'type'])
@Index('idx_sub_notifications_sub', ['subscriptionId'])
export class SubscriptionNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ID of the driver_subscriptions or company_subscriptions row. */
  @Column({ type: 'uuid', name: 'subscription_id' })
  subscriptionId: string;

  /** 'driver' or 'company' — to disambiguate subscription_id. */
  @Column({ type: 'varchar', length: 20, name: 'subscription_kind' })
  subscriptionKind: 'driver' | 'company';

  @Column({
    type: 'enum',
    enum: SubscriptionNotificationType,
  })
  type: SubscriptionNotificationType;

  /** The period_end this notification was sent for (lets us re-notify on renewal). */
  @Column({ type: 'timestamptz', name: 'period_end' })
  periodEnd: Date;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;
}

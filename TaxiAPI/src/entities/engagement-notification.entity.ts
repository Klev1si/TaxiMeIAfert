import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Which automatic engagement campaign a push belonged to. */
export enum EngagementNotificationType {
  DRIVER_MORNING      = 'driver_morning',
  DRIVER_EVENING_PEAK = 'driver_evening_peak',
  DRIVER_WINBACK      = 'driver_winback',
  DRIVER_WEEKLY       = 'driver_weekly',
  COMPANY_MORNING     = 'company_morning',
  COMPANY_NO_DRIVERS  = 'company_no_drivers',
  COMPANY_WEEKLY      = 'company_weekly',
  CLIENT_FIRST_RIDE   = 'client_first_ride',
  CLIENT_WINBACK      = 'client_winback',
  CLIENT_WEEKEND      = 'client_weekend',
}

/**
 * Ledger of automatic engagement pushes (morning reminders, win-backs,
 * weekly summaries). Used to enforce per-campaign intervals, the daily
 * per-user cap, and to avoid repeating the same message text twice in a row.
 */
@Entity('engagement_notifications')
@Index('idx_engagement_notifications_user_type', ['userId', 'type', 'sentAt'])
@Index('idx_engagement_notifications_user_sent', ['userId', 'sentAt'])
export class EngagementNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 40 })
  type: EngagementNotificationType;

  /** Key of the message variant that was sent — see engagement-messages.ts. */
  @Column({ type: 'varchar', name: 'message_key', length: 60 })
  messageKey: string;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** What kind of platform event the notification is about. */
export enum AdminNotificationType {
  USER_REGISTERED = 'user_registered',
}

/**
 * Persistent notification feed for super-admins.
 *
 * Written by the backend when something an admin should know about happens
 * (e.g. a new user registers — some users register and delete their account
 * minutes later, so this row is the durable record of who they were even
 * after the account is gone). Read by the dashboard bell (polling) and
 * mirrored as an FCM push to every admin's mobile app.
 */
@Entity('admin_notifications')
@Index('idx_admin_notifications_unread', ['isRead', 'createdAt'])
export class AdminNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  type: AdminNotificationType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  body: string;

  /**
   * Structured details for the UI — e.g. { userId, firstName, lastName,
   * phone, email, role }. Kept even if the user row is later deleted.
   */
  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, string | null> | null;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

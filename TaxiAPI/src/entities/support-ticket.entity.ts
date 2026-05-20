import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SupportMessage } from './support-message.entity';

export enum TicketCategory {
  RIDE_ISSUE      = 'ride_issue',
  PAYMENT         = 'payment',
  ACCOUNT         = 'account',
  DRIVER_BEHAVIOR = 'driver_behavior',
  APP_BUG         = 'app_bug',
  OTHER           = 'other',
}

export enum TicketStatus {
  OPEN        = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED    = 'resolved',
  CLOSED      = 'closed',
}

export enum TicketPriority {
  LOW    = 'low',
  NORMAL = 'normal',
  HIGH   = 'high',
  URGENT = 'urgent',
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User who submitted the ticket (User.id). */
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  /** Role of the submitter at ticket creation time. */
  @Column({ type: 'varchar', name: 'user_role', length: 20 })
  userRole: string;   // 'client' | 'driver'

  @Column({ type: 'enum', enum: TicketCategory })
  category: TicketCategory;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.NORMAL })
  priority: TicketPriority;

  /** Optional ride this ticket relates to. */
  @Column({ type: 'uuid', name: 'ride_id', nullable: true })
  rideId: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SupportMessage, (m) => m.ticket, { cascade: ['insert'] })
  messages: SupportMessage[];
}

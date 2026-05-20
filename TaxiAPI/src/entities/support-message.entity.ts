import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SupportTicket } from './support-ticket.entity';

@Entity('support_messages')
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'ticket_id' })
  ticketId: string;

  /** User.id of the person who wrote this message. */
  @Column({ type: 'varchar', name: 'author_id' })
  authorId: string;

  /** 'user' (client or driver) | 'admin' */
  @Column({ type: 'varchar', name: 'author_role', length: 10 })
  authorRole: 'user' | 'admin';

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => SupportTicket, (t) => t.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: SupportTicket;
}

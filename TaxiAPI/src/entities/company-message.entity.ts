import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum CompanyMessageFromRole {
  COMPANY = 'company',
  DRIVER  = 'driver',
}

/**
 * Direct messages between a company and one of its drivers.
 *
 * A row exists per message — readAt is set when the *recipient* reads it.
 * The thread for a (companyId, driverId) pair is the chronological set of
 * rows; ordering is by createdAt ASC.
 */
@Entity('company_messages')
@Index('idx_company_messages_thread', ['companyId', 'driverId', 'createdAt'])
@Index('idx_company_messages_unread', ['companyId', 'driverId', 'readAt'])
export class CompanyMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'company_id' })
  companyId: string;

  @Column({ type: 'uuid', name: 'driver_id' })
  driverId: string;

  /** Who sent the message — drives unread accounting on the opposite side. */
  @Column({
    type: 'enum',
    enum: CompanyMessageFromRole,
    name: 'from_role',
  })
  fromRole: CompanyMessageFromRole;

  @Column({ type: 'text' })
  text: string;

  /** NULL until the recipient reads it. */
  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

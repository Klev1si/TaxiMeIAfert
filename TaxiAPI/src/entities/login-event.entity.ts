import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** How a session was obtained or extended. */
export enum LoginMethod {
  PASSWORD = 'password',
  GOOGLE   = 'google',
  APPLE    = 'apple',
  REGISTER = 'register',
  /** Refresh-token exchange — an already signed-in device coming back. */
  REFRESH  = 'refresh',
}

/**
 * Append-only record of every token issuance (sign-in, sign-up, refresh) with
 * the network and device it came from. Lets an admin answer "which device
 * was using this account at time X?" — refresh tokens live 30 days, so a
 * device can act on an account long after its last password/OTP login.
 */
@Entity('login_events')
@Index('idx_login_events_user_created', ['userId', 'createdAt'])
export class LoginEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  method: LoginMethod;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', name: 'forwarded_for', length: 255, nullable: true })
  forwardedFor: string | null;

  @Column({ type: 'varchar', name: 'user_agent', length: 300, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', name: 'client_platform', length: 60, nullable: true })
  clientPlatform: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

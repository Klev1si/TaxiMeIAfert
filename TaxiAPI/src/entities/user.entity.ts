import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../common/enums';
import { Client } from './client.entity';
import { Driver } from './driver.entity';
import { Company } from './company.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Phone is the canonical login identifier for phone-registered users but
  // nullable so Google-signed-up users can exist with email-only until they
  // complete their profile and add a phone for ride operations.
  @Column({ type: 'varchar', unique: true, nullable: true, length: 20 })
  phone: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true, length: 255 })
  email: string | null;

  // Same nullability story for the password — Google users don't have one;
  // they auth via the OAuth ID token. Phone/email users still set one.
  @Column({ type: 'varchar', name: 'password_hash', nullable: true, length: 255 })
  passwordHash: string | null;

  /**
   * Google account "sub" identifier from the OAuth ID token. Stable per
   * Google account — never reused, never changes if the user changes their
   * email at Google. Set only for users who signed up / linked with Google.
   */
  @Column({ type: 'varchar', name: 'google_sub', unique: true, nullable: true, length: 64 })
  googleSub: string | null;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ name: 'is_phone_verified', default: false })
  isPhoneVerified: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', name: 'refresh_token', nullable: true, length: 500 })
  refreshToken: string | null;

  @Column({ type: 'varchar', name: 'fcm_token', nullable: true, length: 500 })
  fcmToken: string | null;

  @Column({ type: 'varchar', name: 'avatar_url', nullable: true, length: 500 })
  avatarUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => Client, (client) => client.user)
  client: Client;

  @OneToOne(() => Driver, (driver) => driver.user)
  driver: Driver;

  @OneToOne(() => Company, (company) => company.user)
  company: Company;
}

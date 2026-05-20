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

  @Column({ type: 'varchar', unique: true, length: 20 })
  phone: string;

  @Column({ type: 'varchar', unique: true, nullable: true, length: 255 })
  email: string | null;

  @Column({ type: 'varchar', name: 'password_hash', length: 255 })
  passwordHash: string;

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

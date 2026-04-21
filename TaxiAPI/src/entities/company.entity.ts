import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Driver } from './driver.entity';
import { Tariff } from './tariff.entity';
import { Ride } from './ride.entity';
import { CompanySubscription } from './company-subscription.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', name: 'logo_url', nullable: true, length: 500 })
  logoUrl: string | null;

  @Column({ type: 'varchar', nullable: true, length: 300 })
  address: string | null;

  @Column({ type: 'varchar', nullable: true, length: 100 })
  city: string | null;

  @Column({ name: 'is_approved', default: false })
  isApproved: boolean;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'varchar', name: 'stripe_customer_id', nullable: true, length: 100 })
  stripeCustomerId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => User, (user) => user.company)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Driver, (driver) => driver.company)
  drivers: Driver[];

  @OneToMany(() => Tariff, (tariff) => tariff.company)
  tariffs: Tariff[];

  @OneToMany(() => Ride, (ride) => ride.company)
  rides: Ride[];

  @OneToMany(() => CompanySubscription, (sub) => sub.company)
  subscriptions: CompanySubscription[];
}

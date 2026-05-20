import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionStatus } from '../common/enums';
import { Driver } from './driver.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('driver_subscriptions')
export class DriverSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'driver_id' })
  driverId: string;

  @Column({ type: 'varchar', name: 'plan_id' })
  planId: string;

  @Column({ type: 'varchar', name: 'stripe_subscription_id', nullable: true, unique: true, length: 100 })
  stripeSubscriptionId: string | null;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.TRIALING })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz', name: 'current_period_start' })
  currentPeriodStart: Date;

  @Column({ type: 'timestamptz', name: 'current_period_end' })
  currentPeriodEnd: Date;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.driverSubscriptions)
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;
}

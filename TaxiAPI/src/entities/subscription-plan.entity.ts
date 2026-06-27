import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BillingPeriod } from '../common/enums';
import { CompanySubscription } from './company-subscription.entity';
import { DriverSubscription } from './driver-subscription.entity';

/** Who this plan is offered to. */
export type PlanAudience = 'company' | 'driver';

@Entity('subscription_plans')
@Index('idx_plans_audience_period_active', ['targetAudience', 'billingPeriod', 'isActive'])
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** Price for the full billing period (not normalized to monthly). */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({
    type: 'enum',
    enum: BillingPeriod,
    name: 'billing_period',
    default: BillingPeriod.MONTHLY,
  })
  billingPeriod: BillingPeriod;

  /**
   * For company plans: max number of drivers allowed under the company.
   * For driver plans: set to 1 (one driver = the subscriber).
   */
  @Column({ type: 'int', name: 'max_drivers', default: 1 })
  maxDrivers: number;

  @Column({ type: 'jsonb', default: '[]' })
  features: string[];

  @Column({
    type: 'varchar',
    length: 20,
    name: 'target_audience',
    default: 'company',
  })
  targetAudience: PlanAudience;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => CompanySubscription, (sub) => sub.plan)
  companySubscriptions: CompanySubscription[];

  @OneToMany(() => DriverSubscription, (sub) => sub.plan)
  driverSubscriptions: DriverSubscription[];
}

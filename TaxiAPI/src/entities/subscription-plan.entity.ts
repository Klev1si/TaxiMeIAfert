import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanySubscription } from './company-subscription.entity';
import { DriverSubscription } from './driver-subscription.entity';

/** Who this plan is offered to. */
export type PlanAudience = 'company' | 'driver';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'decimal', name: 'price_monthly', precision: 10, scale: 2 })
  priceMonthly: number;

  /**
   * For company plans: max number of drivers allowed under the company.
   * For driver plans: set to 1 (one driver = the subscriber).
   */
  @Column({ type: 'int', name: 'max_drivers', default: 1 })
  maxDrivers: number;

  @Column({ type: 'jsonb', default: '[]' })
  features: string[];

  @Column({ type: 'varchar', name: 'stripe_price_id', nullable: true, length: 100 })
  stripePriceId: string | null;

  /**
   * Target audience for this plan.
   * 'company' = shown to company accounts only.
   * 'driver'  = shown to individual (solo) drivers only.
   * Defaults to 'company' for backward compatibility with existing plans.
   */
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

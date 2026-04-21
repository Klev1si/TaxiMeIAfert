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
import { Company } from './company.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('company_subscriptions')
export class CompanySubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'company_id' })
  companyId: string;

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
  @ManyToOne(() => Company, (company) => company.subscriptions)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.companySubscriptions)
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;
}

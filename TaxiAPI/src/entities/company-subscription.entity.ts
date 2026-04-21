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

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ name: 'plan_id' })
  planId: string;

  @Column({ name: 'stripe_subscription_id', nullable: true, unique: true, length: 100 })
  stripeSubscriptionId: string | null;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.TRIALING })
  status: SubscriptionStatus;

  @Column({ name: 'current_period_start', type: 'timestamptz' })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'timestamptz' })
  currentPeriodEnd: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
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

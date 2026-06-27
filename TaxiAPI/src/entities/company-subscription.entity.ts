import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentMethod, SubscriptionStatus } from '../common/enums';
import { Company } from './company.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('company_subscriptions')
@Index('idx_company_subs_period_end', ['currentPeriodEnd'])
@Index('idx_company_subs_status', ['status'])
export class CompanySubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'company_id' })
  companyId: string;

  @Column({ type: 'varchar', name: 'plan_id' })
  planId: string;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    name: 'payment_method',
    default: PaymentMethod.CARD,
  })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', name: 'paysera_order_id', nullable: true, length: 100 })
  payseraOrderId: string | null;

  @Column({ type: 'varchar', name: 'paid_by_admin_id', nullable: true })
  paidByAdminId: string | null;

  @Column({ type: 'timestamptz', name: 'paid_at', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'varchar', name: 'payment_reference', nullable: true, length: 200 })
  paymentReference: string | null;

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

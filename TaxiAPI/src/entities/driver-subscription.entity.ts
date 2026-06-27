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
import { Driver } from './driver.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('driver_subscriptions')
@Index('idx_driver_subs_period_end', ['currentPeriodEnd'])
@Index('idx_driver_subs_status', ['status'])
export class DriverSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'driver_id' })
  driverId: string;

  @Column({ type: 'varchar', name: 'plan_id' })
  planId: string;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    name: 'payment_method',
    default: PaymentMethod.CARD,
  })
  paymentMethod: PaymentMethod;

  /** Paysera order/payment id when paid by card. */
  @Column({ type: 'varchar', name: 'paysera_order_id', nullable: true, length: 100 })
  payseraOrderId: string | null;

  /** Admin user id who confirmed a cash payment. */
  @Column({ type: 'varchar', name: 'paid_by_admin_id', nullable: true })
  paidByAdminId: string | null;

  @Column({ type: 'timestamptz', name: 'paid_at', nullable: true })
  paidAt: Date | null;

  /** Free-text receipt / reference for cash payments. */
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
  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.driverSubscriptions)
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;
}

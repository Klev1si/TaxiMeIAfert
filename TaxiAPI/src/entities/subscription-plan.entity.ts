import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanySubscription } from './company-subscription.entity';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  name: string;

  @Column({ name: 'price_monthly', type: 'decimal', precision: 10, scale: 2 })
  priceMonthly: number;

  @Column({ name: 'max_drivers' })
  maxDrivers: number;

  @Column({ type: 'jsonb', default: '[]' })
  features: string[];

  @Column({ name: 'stripe_price_id', nullable: true, length: 100 })
  stripePriceId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => CompanySubscription, (sub) => sub.plan)
  companySubscriptions: CompanySubscription[];
}

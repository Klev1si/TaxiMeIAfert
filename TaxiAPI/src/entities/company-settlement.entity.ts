import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Driver } from './driver.entity';

/**
 * direction:
 *   'cash_in'  — driver gave cash to company (settles driver's debt for cash rides)
 *   'card_out' — company paid driver their card-ride share
 */
export type SettlementDirection = 'cash_in' | 'card_out';

/**
 * Records a settlement between a company and one of its drivers.
 *
 * Background: when a driver under a company takes a CASH ride, the driver
 * keeps the full passenger payment in their pocket but OWES the company the
 * commission share (e.g. 30%). When a driver takes a CARD ride, the
 * platform's Stripe account receives the money, takes 10%, then the company
 * owes the driver their share (e.g. 70%) of the remaining 90%. Settlements
 * track when these offline money exchanges happen.
 */
@Entity('company_settlements')
@Index(['companyId', 'driverId'])
export class CompanySettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'company_id' })
  companyId: string;

  @Column({ type: 'uuid', name: 'driver_id' })
  driverId: string;

  @Column({ type: 'varchar', length: 16 })
  direction: SettlementDirection;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────
  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;
}

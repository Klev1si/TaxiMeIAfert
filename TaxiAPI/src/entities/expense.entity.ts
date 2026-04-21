import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExpenseType } from '../common/enums';
import { Driver } from './driver.entity';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id' })
  driverId: string;

  @Column({ type: 'enum', enum: ExpenseType })
  type: ExpenseType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ nullable: true, length: 300 })
  description: string | null;

  @Column({ name: 'expense_date', type: 'date' })
  expenseDate: Date;

  @Column({ name: 'receipt_url', nullable: true, length: 500 })
  receiptUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Driver, (driver) => driver.expenses)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;
}

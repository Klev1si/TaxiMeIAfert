import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A payment a commission-contract company or solo driver made to the
 * platform (cash, bank transfer…), recorded by an admin. Exactly one of
 * companyId / driverId is set. Balance = commission owed − these payments.
 */
@Entity('commission_payments')
@Index(['companyId', 'createdAt'])
@Index(['driverId', 'createdAt'])
export class CommissionPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'company_id', nullable: true })
  companyId: string | null;

  @Column({ type: 'uuid', name: 'driver_id', nullable: true })
  driverId: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @Column({ type: 'uuid', name: 'recorded_by_admin_id' })
  recordedByAdminId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

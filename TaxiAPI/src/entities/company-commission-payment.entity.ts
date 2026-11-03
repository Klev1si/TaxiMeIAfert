import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A payment a commission-contract company made to the platform (cash, bank
 * transfer…), recorded by an admin. The company's balance is the commission
 * owed on its rides minus the sum of these payments.
 */
@Entity('company_commission_payments')
@Index(['companyId', 'createdAt'])
export class CompanyCommissionPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'company_id' })
  companyId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @Column({ type: 'uuid', name: 'recorded_by_admin_id' })
  recordedByAdminId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Driver } from './driver.entity';
import { Ride } from './ride.entity';

/**
 * Append-only financial ledger for a driver.
 *  - 'credit'  — driver's share of a completed ride fare
 *  - 'payout'  — admin-processed payout to the driver (withdrawal)
 *
 * balance = SUM(credits) - SUM(payouts)
 */
export type LedgerEntryType = 'credit' | 'payout';

@Entity('driver_ledger')
export class DriverLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'driver_id' })
  driverId: string;

  /** Entry type: 'credit' adds to balance; 'payout' subtracts. */
  @Column({ type: 'varchar', length: 10 })
  type: LedgerEntryType;

  /** Always a positive value. Direction is encoded by `type`. */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  /** Populated for credit entries — which ride this earning came from. */
  @Column({ type: 'uuid', name: 'ride_id', nullable: true })
  rideId: string | null;

  /** Commission percentage applied (stored for audit/history). */
  @Column({ type: 'decimal', name: 'commission_pct', precision: 5, scale: 2, nullable: true })
  commissionPct: number | null;

  /** Human-readable note (used for payout entries: "Bank transfer Feb 2026"). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────
  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @ManyToOne(() => Ride, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ride_id' })
  ride: Ride | null;
}

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
 * balance = SUM(non-cash credits) - SUM(payouts)
 *   ↑ cash credits are recorded for history but don't count toward the
 *     "platform owes driver" balance — the driver collected those funds
 *     directly from the passenger.
 */
export type LedgerEntryType = 'credit' | 'payout';

/**
 * How the passenger paid for the ride this credit represents.
 *  - 'pending' — ride completed but payment not yet confirmed (default)
 *  - 'cash'    — paid cash to driver directly; platform owes nothing
 *  - 'card'    — paid via Stripe; money is in platform account, platform owes driver
 *  - null      — legacy entries from before this column existed (treated as 'pending')
 */
export type LedgerPaymentMethod = 'pending' | 'cash' | 'card';

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

  /**
   * Gross fare of the ride before any deductions. Stored so the driver/company
   * UIs can show a transparent 3-way breakdown (driver / company / platform)
   * without needing to re-join the rides table at display time.
   * NULL for legacy entries — backfilled at startup from rides.total_fare.
   */
  @Column({ type: 'decimal', name: 'gross_fare', precision: 10, scale: 2, nullable: true })
  grossFare: number | null;

  /** Human-readable note (used for payout entries: "Bank transfer Feb 2026"). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  /** How the passenger paid for the corresponding ride. See LedgerPaymentMethod
   *  doc. Only relevant for `credit` entries — `payout` entries leave this NULL. */
  @Column({ type: 'varchar', name: 'payment_method', length: 10, nullable: true })
  paymentMethod: LedgerPaymentMethod | null;

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

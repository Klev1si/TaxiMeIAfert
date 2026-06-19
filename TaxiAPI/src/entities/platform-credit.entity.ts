import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PlatformCreditReason {
  /** Auto-applied 50% off on a client's first completed ride. */
  FIRST_RIDE_PROMO = 'first_ride_promo',
  /** Admin-issued global promo code redeemed on this ride. */
  ADMIN_PROMO_CODE = 'admin_promo_code',
}

/**
 * Ledger of every discount the *platform* (not the driver, not the company)
 * absorbed on a ride. Drivers always receive the full fare; platform credits
 * the difference so passenger acquisition costs are accounted for.
 *
 * Used by the admin Finances screen to track total marketing spend.
 */
@Entity('platform_credits')
@Index('idx_platform_credits_created', ['createdAt'])
@Index('idx_platform_credits_reason',  ['reason', 'createdAt'])
export class PlatformCredit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'ride_id', unique: true })
  rideId: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId: string;

  /** Null on rides that ended without a driver (shouldn't happen but be safe). */
  @Column({ type: 'uuid', name: 'driver_id', nullable: true })
  driverId: string | null;

  /** Discount amount in the platform's base currency (EUR for Kosovo). */
  @Column({ type: 'decimal', name: 'amount', precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: PlatformCreditReason,
    name: 'reason',
  })
  reason: PlatformCreditReason;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

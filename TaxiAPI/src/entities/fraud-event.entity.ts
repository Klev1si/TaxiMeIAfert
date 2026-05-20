import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type FraudEventType =
  | 'concurrent_ride_attempt'
  | 'gps_spoof_detected'
  | 'otp_lockout'
  | 'promo_abuse';

@Entity('fraud_events')
export class FraudEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Which rule fired */
  @Column({ type: 'varchar', length: 60 })
  type: FraudEventType;

  /** User who triggered the event (client / driver / any user) */
  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId: string | null;

  /** Driver ID for GPS-spoof events */
  @Column({ type: 'uuid', nullable: true, name: 'driver_id' })
  driverId: string | null;

  /** Ride ID for ride-related events */
  @Column({ type: 'uuid', nullable: true, name: 'ride_id' })
  rideId: string | null;

  /** Free-form extra detail (phone, speed, promo code, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

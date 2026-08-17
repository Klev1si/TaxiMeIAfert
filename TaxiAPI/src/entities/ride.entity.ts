import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RideStatus, PaymentStatus, UserRole, VehicleType } from '../common/enums';
import { Client } from './client.entity';
import { Driver } from './driver.entity';
import { Company } from './company.entity';
import { Tariff } from './tariff.entity';

@Entity('rides')
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'client_id' })
  clientId: string;

  @Column({ type: 'varchar', name: 'driver_id', nullable: true })
  driverId: string | null;

  @Column({ type: 'varchar', name: 'company_id', nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', name: 'tariff_id', nullable: true })
  tariffId: string | null;

  /** Vehicle type requested by the client (economy / comfort / XL).
   *  Null = any available driver accepted. */
  @Column({
    type: 'enum',
    enum: VehicleType,
    name: 'vehicle_type',
    nullable: true,
    default: null,
  })
  vehicleType: VehicleType | null;

  @Column({ type: 'enum', enum: RideStatus, default: RideStatus.REQUESTED })
  status: RideStatus;

  // Pickup
  @Column({ type: 'decimal', name: 'pickup_lat', precision: 9, scale: 6 })
  pickupLat: number;

  @Column({ type: 'decimal', name: 'pickup_lng', precision: 9, scale: 6 })
  pickupLng: number;

  @Column({ type: 'varchar', name: 'pickup_address', nullable: true, length: 300 })
  pickupAddress: string | null;

  // Dropoff
  @Column({ type: 'decimal', name: 'dropoff_lat', precision: 9, scale: 6, nullable: true })
  dropoffLat: number | null;

  @Column({ type: 'decimal', name: 'dropoff_lng', precision: 9, scale: 6, nullable: true })
  dropoffLng: number | null;

  @Column({ type: 'varchar', name: 'dropoff_address', nullable: true, length: 300 })
  dropoffAddress: string | null;

  // Fare breakdown
  /** Straight-line or driver-supplied distance used for fare. */
  @Column({ type: 'decimal', name: 'distance_km', precision: 8, scale: 3, nullable: true })
  distanceKm: number | null;

  /** Actual odometer distance computed from GPS waypoints recorded during the ride. */
  @Column({ type: 'decimal', name: 'actual_distance_km', precision: 8, scale: 3, nullable: true })
  actualDistanceKm: number | null;

  @Column({ type: 'decimal', name: 'duration_minutes', precision: 8, scale: 2, nullable: true })
  durationMinutes: number | null;

  @Column({ type: 'decimal', name: 'base_fare', precision: 10, scale: 2, nullable: true })
  baseFare: number | null;

  @Column({ type: 'decimal', name: 'distance_fare', precision: 10, scale: 2, nullable: true })
  distanceFare: number | null;

  @Column({ type: 'decimal', name: 'time_fare', precision: 10, scale: 2, nullable: true })
  timeFare: number | null;

  @Column({ type: 'decimal', name: 'total_fare', precision: 10, scale: 2, nullable: true })
  totalFare: number | null;

  /**
   * Approximate fare computed at dispatch time from the tariff of the driver
   * currently being asked, plus the pickup → dropoff distance. Shown to both
   * the passenger and that driver before the trip. Recomputed on every
   * re-dispatch (decline), so it always reflects whoever is being offered the
   * ride. NULL until a dropoff is set and a driver with a tariff is offered.
   */
  @Column({ type: 'decimal', name: 'estimated_fare', precision: 10, scale: 2, nullable: true })
  estimatedFare: number | null;

  // Payment
  @Column({ type: 'enum', enum: PaymentStatus, name: 'payment_status', default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({ type: 'varchar', name: 'stripe_payment_intent_id', nullable: true, length: 100 })
  stripePaymentIntentId: string | null;

  // Ratings
  @Column({ type: 'smallint', name: 'client_rating', nullable: true })
  clientRating: number | null;

  @Column({ type: 'smallint', name: 'driver_rating', nullable: true })
  driverRating: number | null;

  @Column({ type: 'varchar', name: 'client_review', nullable: true, length: 500 })
  clientReview: string | null;

  @Column({ type: 'varchar', name: 'driver_review', nullable: true, length: 500 })
  driverReview: string | null;

  // Promo code
  @Column({ type: 'varchar', name: 'promo_code', nullable: true, length: 50 })
  promoCode: string | null;

  /** Discount amount actually applied (deducted from fare). */
  @Column({ type: 'decimal', name: 'discount_amount', precision: 10, scale: 2, nullable: true })
  discountAmount: number | null;

  /**
   * One-time public token a passenger can hand out to share the ride live.
   * Anyone with the token can read minimal ride state via /public/rides/track/:token —
   * driver name, plate, status, current driver location, pickup/dropoff. NULL until
   * the passenger taps "Share trip" the first time.
   */
  @Column({ type: 'varchar', name: 'share_token', nullable: true, length: 64 })
  shareToken: string | null;

  // Cancellation
  @Column({ type: 'varchar', name: 'cancel_reason', nullable: true, length: 300 })
  cancelReason: string | null;

  /** Fee charged to the client when they cancel after the grace period. Null = free. */
  @Column({ type: 'decimal', name: 'cancellation_fee', precision: 10, scale: 2, nullable: true })
  cancellationFee: number | null;

  /**
   * Which role reported a no-show.
   * DRIVER → passenger didn't show up at pickup (client is charged a fee).
   * CLIENT → driver never arrived within the wait window (no fee to client).
   * Null  → not a no-show event.
   */
  @Column({ type: 'enum', enum: UserRole, name: 'no_show_reported_by', nullable: true })
  noShowReportedBy: UserRole | null;

  @Column({ type: 'enum', enum: UserRole, name: 'cancelled_by', nullable: true })
  cancelledBy: UserRole | null;

  // Scheduled booking
  /** Null = immediate ride. Future timestamp = scheduled; dispatched by the scheduler. */
  @Column({ type: 'timestamptz', name: 'scheduled_at', nullable: true })
  scheduledAt: Date | null;

  // Timestamps
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'accepted_at', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'pickup_arrived_at', nullable: true })
  pickupArrivedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt: Date | null;

  // Relations
  @ManyToOne(() => Client, (client) => client.rides)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Driver, (driver) => driver.rides, { nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver | null;

  @ManyToOne(() => Company, (company) => company.rides, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @ManyToOne(() => Tariff, (tariff) => tariff.rides, { nullable: true })
  @JoinColumn({ name: 'tariff_id' })
  tariff: Tariff | null;
}

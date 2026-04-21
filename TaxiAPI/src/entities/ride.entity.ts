import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RideStatus, PaymentStatus, UserRole } from '../common/enums';
import { Client } from './client.entity';
import { Driver } from './driver.entity';
import { Company } from './company.entity';
import { Tariff } from './tariff.entity';

@Entity('rides')
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({ name: 'driver_id', nullable: true })
  driverId: string | null;

  @Column({ name: 'company_id', nullable: true })
  companyId: string | null;

  @Column({ name: 'tariff_id', nullable: true })
  tariffId: string | null;

  @Column({ type: 'enum', enum: RideStatus, default: RideStatus.REQUESTED })
  status: RideStatus;

  // Pickup
  @Column({ name: 'pickup_lat', type: 'decimal', precision: 9, scale: 6 })
  pickupLat: number;

  @Column({ name: 'pickup_lng', type: 'decimal', precision: 9, scale: 6 })
  pickupLng: number;

  @Column({ name: 'pickup_address', nullable: true, length: 300 })
  pickupAddress: string | null;

  // Dropoff
  @Column({ name: 'dropoff_lat', type: 'decimal', precision: 9, scale: 6, nullable: true })
  dropoffLat: number | null;

  @Column({ name: 'dropoff_lng', type: 'decimal', precision: 9, scale: 6, nullable: true })
  dropoffLng: number | null;

  @Column({ name: 'dropoff_address', nullable: true, length: 300 })
  dropoffAddress: string | null;

  // Fare breakdown
  @Column({ name: 'distance_km', type: 'decimal', precision: 8, scale: 3, nullable: true })
  distanceKm: number | null;

  @Column({ name: 'duration_minutes', type: 'decimal', precision: 8, scale: 2, nullable: true })
  durationMinutes: number | null;

  @Column({ name: 'base_fare', type: 'decimal', precision: 10, scale: 2, nullable: true })
  baseFare: number | null;

  @Column({ name: 'distance_fare', type: 'decimal', precision: 10, scale: 2, nullable: true })
  distanceFare: number | null;

  @Column({ name: 'time_fare', type: 'decimal', precision: 10, scale: 2, nullable: true })
  timeFare: number | null;

  @Column({ name: 'total_fare', type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalFare: number | null;

  // Payment
  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Column({ name: 'stripe_payment_intent_id', nullable: true, length: 100 })
  stripePaymentIntentId: string | null;

  // Ratings
  @Column({ name: 'client_rating', type: 'smallint', nullable: true })
  clientRating: number | null;

  @Column({ name: 'driver_rating', type: 'smallint', nullable: true })
  driverRating: number | null;

  @Column({ name: 'client_review', nullable: true, length: 500 })
  clientReview: string | null;

  @Column({ name: 'driver_review', nullable: true, length: 500 })
  driverReview: string | null;

  // Cancellation
  @Column({ name: 'cancel_reason', nullable: true, length: 300 })
  cancelReason: string | null;

  @Column({ name: 'cancelled_by', type: 'enum', enum: UserRole, nullable: true })
  cancelledBy: UserRole | null;

  // Timestamps
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'pickup_arrived_at', type: 'timestamptz', nullable: true })
  pickupArrivedAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
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

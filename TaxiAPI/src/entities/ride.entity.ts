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

  @Column({ type: 'varchar', name: 'client_id' })
  clientId: string;

  @Column({ type: 'varchar', name: 'driver_id', nullable: true })
  driverId: string | null;

  @Column({ type: 'varchar', name: 'company_id', nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', name: 'tariff_id', nullable: true })
  tariffId: string | null;

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
  @Column({ type: 'decimal', name: 'distance_km', precision: 8, scale: 3, nullable: true })
  distanceKm: number | null;

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

  // Cancellation
  @Column({ type: 'varchar', name: 'cancel_reason', nullable: true, length: 300 })
  cancelReason: string | null;

  @Column({ type: 'enum', enum: UserRole, name: 'cancelled_by', nullable: true })
  cancelledBy: UserRole | null;

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

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Ride } from './ride.entity';

/**
 * A passenger-requested intermediate stop on a ride.
 * Ordered by sortOrder (0-based).  Distinct from RideWaypoint, which
 * records the driver's GPS path during the trip.
 */
@Entity('ride_stops')
export class RideStop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'ride_id' })
  rideId: string;

  /** 0-based position in the stop list (lower = earlier). */
  @Column({ type: 'smallint', name: 'sort_order' })
  sortOrder: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  lng: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  /** Set by the driver when they arrive at this stop. */
  @Column({ type: 'timestamptz', name: 'reached_at', nullable: true })
  reachedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;
}

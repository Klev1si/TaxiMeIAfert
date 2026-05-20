import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One GPS snapshot recorded while a ride is IN_PROGRESS.
 * Rows are written in batches from the Redis buffer during the ride
 * and on ride completion.
 */
@Entity('ride_waypoints')
@Index('idx_ride_waypoints_ride_id', ['rideId'])
export class RideWaypoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'ride_id' })
  rideId: string;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  lng: number;

  /** When the GPS fix was captured (driver's device clock, proxied via server). */
  @Column({ type: 'timestamptz', name: 'recorded_at' })
  recordedAt: Date;
}

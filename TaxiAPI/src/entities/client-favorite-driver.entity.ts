import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { Driver } from './driver.entity';

/**
 * A client's saved/favorite driver.
 *
 * Clients can save drivers they like so they can quickly call them or
 * request a ride directly with the same driver. Unique on (clientId, driverId).
 */
@Entity('client_favorite_drivers')
@Index(['clientId', 'driverId'], { unique: true })
export class ClientFavoriteDriver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId: string;

  @Column({ type: 'uuid', name: 'driver_id' })
  driverId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;
}

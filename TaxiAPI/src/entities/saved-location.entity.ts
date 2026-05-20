import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('saved_locations')
export class SavedLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** References clients.id — cascade-deletes when the client is removed */
  @Column({ name: 'client_id' })
  clientId: string;

  /** Human-readable name: "Home", "Work", "Gym", etc. */
  @Column({ length: 40 })
  label: string;

  /** Optional display address — free text, not geocoded */
  @Column({ type: 'varchar', length: 200, nullable: true, default: null })
  address: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  lng: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

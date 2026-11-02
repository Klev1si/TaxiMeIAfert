import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Small key → JSON store for platform-wide settings an admin can change at
 * runtime without a deploy (e.g. the first-ride offer).
 */
@Entity('platform_settings')
export class PlatformSetting {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'jsonb' })
  value: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

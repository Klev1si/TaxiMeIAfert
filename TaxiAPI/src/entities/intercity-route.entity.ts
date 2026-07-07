import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type IntercityRouteOwnerType = 'driver' | 'company';

/**
 * Fixed intercity fare that overrides the normal tariff formula when the
 * rider's pickup lies inside `from`'s radius and dropoff inside `to`'s
 * radius (or the reverse if `bidirectional`). Owned either by a solo
 * driver (their personal price) or a company (applies to their entire
 * fleet). The existing commission split still applies.
 */
@Entity('intercity_routes')
@Index('idx_intercity_routes_owner', ['ownerType', 'ownerId'])
export class IntercityRoute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10, name: 'owner_type' })
  ownerType: IntercityRouteOwnerType;

  @Column({ type: 'varchar', name: 'owner_id' })
  ownerId: string;

  // ── From city ───────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 80, name: 'from_city' })
  fromCity: string;

  @Column({ type: 'double precision', name: 'from_lat' })
  fromLat: number;

  @Column({ type: 'double precision', name: 'from_lng' })
  fromLng: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'from_radius_km', default: 8 })
  fromRadiusKm: number;

  // ── To city ─────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 80, name: 'to_city' })
  toCity: string;

  @Column({ type: 'double precision', name: 'to_lat' })
  toLat: number;

  @Column({ type: 'double precision', name: 'to_lng' })
  toLng: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'to_radius_km', default: 8 })
  toRadiusKm: number;

  // ── Fare ────────────────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'flat_fare' })
  flatFare: number;

  @Column({ type: 'boolean', default: true })
  bidirectional: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

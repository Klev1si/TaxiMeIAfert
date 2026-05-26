import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VehicleType } from '../common/enums';
import { Company } from './company.entity';
import { Ride } from './ride.entity';

@Entity('tariffs')
export class Tariff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** NULL = platform-wide global tariff (used by individual/solo drivers) */
  @Column({ type: 'varchar', name: 'company_id', nullable: true, default: null })
  companyId: string | null;

  /**
   * NULL = company- or platform-wide tariff (the normal case).
   * Non-null = a solo driver's personal tariff. Only one such row per driver is
   * expected, but the schema allows multiple to support vehicle-type variants.
   */
  @Column({ type: 'varchar', name: 'driver_id', nullable: true, default: null })
  driverId: string | null;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'decimal', name: 'base_fare', precision: 10, scale: 2 })
  baseFare: number;

  @Column({ type: 'decimal', name: 'per_km_rate', precision: 10, scale: 2 })
  perKmRate: number;

  @Column({ type: 'decimal', name: 'per_minute_rate', precision: 10, scale: 2 })
  perMinuteRate: number;

  @Column({ type: 'decimal', name: 'minimum_fare', precision: 10, scale: 2 })
  minimumFare: number;

  @Column({ name: 'is_night_tariff', default: false })
  isNightTariff: boolean;

  @Column({ type: 'smallint', name: 'night_start_hour', nullable: true })
  nightStartHour: number | null;

  @Column({ type: 'smallint', name: 'night_end_hour', nullable: true })
  nightEndHour: number | null;

  /**
   * Surge multiplier applied on top of the standard fare (e.g. 1.5 = +50%).
   * Set to 1.00 (no surge) by default. Admins raise it during peak hours.
   */
  @Column({
    type: 'decimal',
    name: 'surge_multiplier',
    precision: 4,
    scale: 2,
    default: 1.00,
  })
  surgeMultiplier: number;

  /**
   * Vehicle type this tariff applies to.
   * NULL = applies to all vehicle types (generic fallback).
   */
  @Column({
    type: 'enum',
    enum: VehicleType,
    name: 'vehicle_type',
    nullable: true,
    default: null,
  })
  vehicleType: VehicleType | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Company, (company) => company.tariffs)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => Ride, (ride) => ride.tariff)
  rides: Ride[];
}

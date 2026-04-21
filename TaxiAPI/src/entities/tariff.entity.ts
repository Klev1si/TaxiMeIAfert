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
import { Company } from './company.entity';
import { Ride } from './ride.entity';

@Entity('tariffs')
export class Tariff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'company_id' })
  companyId: string;

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

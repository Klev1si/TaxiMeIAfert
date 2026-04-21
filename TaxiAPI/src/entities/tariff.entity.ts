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

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ length: 80 })
  name: string;

  @Column({ name: 'base_fare', type: 'decimal', precision: 10, scale: 2 })
  baseFare: number;

  @Column({ name: 'per_km_rate', type: 'decimal', precision: 10, scale: 2 })
  perKmRate: number;

  @Column({ name: 'per_minute_rate', type: 'decimal', precision: 10, scale: 2 })
  perMinuteRate: number;

  @Column({ name: 'minimum_fare', type: 'decimal', precision: 10, scale: 2 })
  minimumFare: number;

  @Column({ name: 'is_night_tariff', default: false })
  isNightTariff: boolean;

  @Column({ name: 'night_start_hour', type: 'smallint', nullable: true })
  nightStartHour: number | null;

  @Column({ name: 'night_end_hour', type: 'smallint', nullable: true })
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

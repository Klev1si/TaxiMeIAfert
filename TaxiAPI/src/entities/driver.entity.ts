import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';
import { Ride } from './ride.entity';
import { Expense } from './expense.entity';

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: string | null;

  @Column({ name: 'first_name', length: 80 })
  firstName: string;

  @Column({ name: 'last_name', length: 80 })
  lastName: string;

  @Column({ name: 'photo_url', nullable: true, length: 500 })
  photoUrl: string | null;

  @Column({ name: 'license_number', length: 50 })
  licenseNumber: string;

  // Vehicle
  @Column({ name: 'vehicle_make', length: 60 })
  vehicleMake: string;

  @Column({ name: 'vehicle_model', length: 60 })
  vehicleModel: string;

  @Column({ name: 'vehicle_year', type: 'smallint' })
  vehicleYear: number;

  @Column({ name: 'vehicle_plate', length: 20 })
  vehiclePlate: string;

  @Column({ name: 'vehicle_color', nullable: true, length: 40 })
  vehicleColor: string | null;

  // Status
  @Column({ name: 'is_approved', default: false })
  isApproved: boolean;

  @Column({ name: 'is_online', default: false })
  isOnline: boolean;

  // Live location (persisted — Redis handles real-time GEO queries)
  @Column({ name: 'current_lat', type: 'decimal', precision: 9, scale: 6, nullable: true })
  currentLat: number | null;

  @Column({ name: 'current_lng', type: 'decimal', precision: 9, scale: 6, nullable: true })
  currentLng: number | null;

  @Column({ name: 'last_location_at', type: 'timestamptz', nullable: true })
  lastLocationAt: Date | null;

  // Stats
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ name: 'total_rides', default: 0 })
  totalRides: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => User, (user) => user.driver)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Company, (company) => company.drivers, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @OneToMany(() => Ride, (ride) => ride.driver)
  rides: Ride[];

  @OneToMany(() => Expense, (expense) => expense.driver)
  expenses: Expense[];
}

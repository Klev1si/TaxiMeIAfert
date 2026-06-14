import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PromoDiscountType {
  PERCENT = 'percent',
  FIXED   = 'fixed',
}

/**
 * Promo codes that clients can apply at ride-booking time.
 *
 * - `discountType = 'percent'` → discount is a percentage of the fare (e.g. 20 means 20 %)
 * - `discountType = 'fixed'`   → discount is a fixed currency amount (e.g. 5.00 means $5 off)
 *
 * A code is valid when:
 *   isActive = true
 *   AND (expiresAt IS NULL OR expiresAt > NOW())
 *   AND (maxUses IS NULL OR usedCount < maxUses)
 */
@Entity('promo_codes')
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * NULL = global / admin-issued, applies to any ride.
   * Non-NULL = owned by this company, only applies when the assigned
   * driver belongs to that company. Validated at ride completion.
   */
  @Column({ type: 'uuid', name: 'company_id', nullable: true })
  companyId: string | null;

  /** The code clients type in (case-insensitive, stored UPPERCASE). */
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: PromoDiscountType,
    name: 'discount_type',
    default: PromoDiscountType.PERCENT,
  })
  discountType: PromoDiscountType;

  /**
   * The discount value.
   * - For 'percent': 0–100 (e.g. 15 = 15 % off)
   * - For 'fixed':   currency amount (e.g. 5.00 = $5 off)
   */
  @Column({ type: 'decimal', name: 'discount_value', precision: 8, scale: 2 })
  discountValue: number;

  /**
   * Optional hard cap on the maximum discount applied (useful for percent codes).
   * NULL = no cap.
   */
  @Column({ type: 'decimal', name: 'max_discount_amount', precision: 8, scale: 2, nullable: true })
  maxDiscountAmount: number | null;

  /**
   * Minimum fare required to use the code.
   * NULL = no minimum.
   */
  @Column({ type: 'decimal', name: 'minimum_fare', precision: 8, scale: 2, nullable: true })
  minimumFare: number | null;

  /** NULL = unlimited. Once usedCount reaches maxUses the code is exhausted. */
  @Column({ type: 'int', name: 'max_uses', nullable: true })
  maxUses: number | null;

  /** Incremented atomically each time the code is successfully applied. */
  @Column({ type: 'int', name: 'used_count', default: 0 })
  usedCount: number;

  /** NULL = never expires. */
  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

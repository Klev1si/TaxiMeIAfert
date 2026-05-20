import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Immutable record of every significant admin action.
 * Rows are never updated or deleted — they form an append-only audit trail.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ID of the admin (User.id) who performed the action. */
  @Column({ type: 'varchar', name: 'admin_id' })
  adminId: string;

  /** Human-readable admin identity kept at log time (phone or email). */
  @Column({ type: 'varchar', name: 'admin_phone', length: 30, nullable: true })
  adminPhone: string | null;

  /**
   * Dot-namespaced action string, e.g.:
   *   driver.approved  driver.rejected
   *   document.approved  document.rejected
   *   tariff.created  tariff.updated  tariff.deleted
   *   promo.created   promo.updated   promo.deleted
   *   plan.created    plan.updated    plan.deleted
   */
  @Column({ type: 'varchar', name: 'action', length: 80 })
  action: string;

  /** Entity type the action was performed on (driver / document / tariff / …). */
  @Column({ type: 'varchar', name: 'target_type', length: 40 })
  targetType: string;

  /** Primary key of the affected record (may be UUID or short string). */
  @Column({ type: 'varchar', name: 'target_id', nullable: true, length: 100 })
  targetId: string | null;

  /** Arbitrary extra context stored as JSONB (before/after values, reasons, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

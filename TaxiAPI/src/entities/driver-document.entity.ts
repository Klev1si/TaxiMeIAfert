import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentStatus, DocumentType } from '../common/enums';
import { Driver } from './driver.entity';

@Entity('driver_documents')
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'driver_id' })
  driverId: string;

  /** Type of document uploaded. */
  @Column({ type: 'enum', enum: DocumentType })
  type: DocumentType;

  /** Current review status. */
  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.PENDING })
  status: DocumentStatus;

  /** Relative path served under /uploads/documents/. */
  @Column({ type: 'varchar', name: 'file_url', length: 500 })
  fileUrl: string;

  /** Original filename reported by the browser / client. */
  @Column({ type: 'varchar', name: 'original_name', nullable: true, length: 255 })
  originalName: string | null;

  /** Reason provided when an admin rejects the document. */
  @Column({ type: 'varchar', name: 'rejection_reason', nullable: true, length: 500 })
  rejectionReason: string | null;

  /** Admin user ID who reviewed this document (null while pending). */
  @Column({ type: 'varchar', name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────
  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;
}

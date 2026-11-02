import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Records that an identity (phone, email, Google/Apple account) has already
 * used the first-ride offer. Only a keyed one-way hash (HMAC-SHA256) is
 * stored — never the phone number or email itself — so it survives account
 * deletion without keeping the person's data (GDPR: fraud prevention).
 */
@Entity('promo_fingerprints')
export class PromoFingerprint {
  /** hex HMAC-SHA256 of "<kind>:<normalised value>" */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  fingerprint: string;

  /** phone | email | google | apple — for statistics only */
  @Column({ type: 'varchar', length: 16 })
  kind: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

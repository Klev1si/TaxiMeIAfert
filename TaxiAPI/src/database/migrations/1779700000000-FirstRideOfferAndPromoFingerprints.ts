import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - platform_settings: admin-editable settings (first-ride offer).
 * - promo_fingerprints: hashed identities that already used the first-ride
 *   offer, so deleting and re-registering doesn't grant it again.
 */
export class FirstRideOfferAndPromoFingerprints1779700000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key        VARCHAR(64) PRIMARY KEY,
        value      JSONB       NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await runner.query(`
      CREATE TABLE IF NOT EXISTS promo_fingerprints (
        fingerprint VARCHAR(64) PRIMARY KEY,
        kind        VARCHAR(16) NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS promo_fingerprints`);
    await runner.query(`DROP TABLE IF EXISTS platform_settings`);
  }
}

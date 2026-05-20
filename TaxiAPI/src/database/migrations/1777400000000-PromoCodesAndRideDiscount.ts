import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 84 — Promo Codes
 *
 * 1. Creates the `promo_codes` table.
 * 2. Adds `promo_code` (varchar) and `discount_amount` (decimal) columns to `rides`.
 */
export class PromoCodesAndRideDiscount1777400000000 implements MigrationInterface {
  name = 'PromoCodesAndRideDiscount1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Create promo_codes type enum ────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "promo_discount_type_enum" AS ENUM ('percent', 'fixed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ── Create promo_codes table ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promo_codes" (
        "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "code"                VARCHAR(50)   NOT NULL,
        "description"         VARCHAR(200)  NULL,
        "discount_type"       "promo_discount_type_enum" NOT NULL DEFAULT 'percent',
        "discount_value"      DECIMAL(8,2)  NOT NULL,
        "max_discount_amount" DECIMAL(8,2)  NULL,
        "minimum_fare"        DECIMAL(8,2)  NULL,
        "max_uses"            INTEGER       NULL,
        "used_count"          INTEGER       NOT NULL DEFAULT 0,
        "expires_at"          TIMESTAMPTZ   NULL,
        "is_active"           BOOLEAN       NOT NULL DEFAULT TRUE,
        "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_promo_codes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_promo_codes_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_promo_codes_code"
      ON "promo_codes" ("code")
      WHERE "is_active" = TRUE
    `);

    // ── Add promo columns to rides ──────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD COLUMN IF NOT EXISTS "promo_code"      VARCHAR(50)  NULL,
      ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(10,2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rides" DROP COLUMN IF EXISTS "discount_amount"`);
    await queryRunner.query(`ALTER TABLE "rides" DROP COLUMN IF EXISTS "promo_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_promo_codes_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promo_codes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "promo_discount_type_enum"`);
  }
}

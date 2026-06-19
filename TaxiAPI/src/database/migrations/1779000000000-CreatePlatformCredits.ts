import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Track platform-funded discounts (eg. first-ride 50% off) so drivers get
 * paid the full fare and the platform's marketing spend is auditable.
 *
 * One row per ride that received a platform-funded discount.
 */
export class CreatePlatformCredits1779000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DO $$ BEGIN
        CREATE TYPE platform_credit_reason_enum AS ENUM ('first_ride_promo', 'admin_promo_code');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS platform_credits (
        id          UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
        ride_id     UUID                          NOT NULL REFERENCES rides(id)   ON DELETE CASCADE,
        client_id   UUID                          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        driver_id   UUID                          NULL     REFERENCES drivers(id) ON DELETE SET NULL,
        amount      DECIMAL(10,2)                 NOT NULL,
        reason      platform_credit_reason_enum   NOT NULL,
        created_at  TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_platform_credits_ride UNIQUE (ride_id)
      )
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_credits_created
        ON platform_credits (created_at)
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_credits_reason
        ON platform_credits (reason, created_at)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS idx_platform_credits_reason`);
    await runner.query(`DROP INDEX IF EXISTS idx_platform_credits_created`);
    await runner.query(`DROP TABLE IF EXISTS platform_credits`);
    await runner.query(`DROP TYPE IF EXISTS platform_credit_reason_enum`);
  }
}

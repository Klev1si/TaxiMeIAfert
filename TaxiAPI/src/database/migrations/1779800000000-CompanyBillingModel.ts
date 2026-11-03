import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contracts with the platform: subscription or a percentage commission,
 * chosen by the admin per company and per solo driver; per-ride snapshots of
 * the commission % and the card fee %; commission payments.
 *
 * Existing companies that ever had a subscription keep working exactly as
 * before ('subscription'). Companies that never subscribed — and new ones —
 * start as 'unassigned' until the admin sets their contract.
 */
export class CompanyBillingModel1779800000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS billing_model VARCHAR(16) NOT NULL DEFAULT 'unassigned',
        ADD COLUMN IF NOT EXISTS platform_commission_pct NUMERIC(5,2) NULL,
        ADD COLUMN IF NOT EXISTS billing_model_set_at TIMESTAMPTZ NULL
    `);
    await runner.query(`
      UPDATE companies SET billing_model = 'subscription'
      WHERE billing_model = 'unassigned'
        AND id::text IN (SELECT company_id::text FROM company_subscriptions)
    `);
    // Solo drivers keep their current subscription by default.
    await runner.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS billing_model VARCHAR(16) NOT NULL DEFAULT 'subscription',
        ADD COLUMN IF NOT EXISTS platform_commission_pct NUMERIC(5,2) NULL,
        ADD COLUMN IF NOT EXISTS billing_model_set_at TIMESTAMPTZ NULL
    `);
    // Per-ride snapshots: commission % (at completion) and card fee % (at payment).
    await runner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS platform_commission_pct NUMERIC(5,2) NULL,
        ADD COLUMN IF NOT EXISTS card_fee_pct NUMERIC(5,2) NULL
    `);
    await runner.query(`
      CREATE TABLE IF NOT EXISTS commission_payments (
        id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id           UUID NULL,
        driver_id            UUID NULL,
        amount               NUMERIC(10,2) NOT NULL,
        note                 VARCHAR(300) NULL,
        recorded_by_admin_id UUID NOT NULL,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT commission_payments_one_payer
          CHECK ((company_id IS NULL) <> (driver_id IS NULL))
      )
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_commission_payments_company ON commission_payments (company_id, created_at)
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_commission_payments_driver ON commission_payments (driver_id, created_at)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS commission_payments`);
    await runner.query(`
      ALTER TABLE rides
        DROP COLUMN IF EXISTS platform_commission_pct,
        DROP COLUMN IF EXISTS card_fee_pct
    `);
    await runner.query(`
      ALTER TABLE drivers
        DROP COLUMN IF EXISTS billing_model,
        DROP COLUMN IF EXISTS platform_commission_pct,
        DROP COLUMN IF EXISTS billing_model_set_at
    `);
    await runner.query(`
      ALTER TABLE companies
        DROP COLUMN IF EXISTS billing_model,
        DROP COLUMN IF EXISTS platform_commission_pct,
        DROP COLUMN IF EXISTS billing_model_set_at
    `);
  }
}

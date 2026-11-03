import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Company contracts: subscription or a percentage commission, chosen by the
 * admin per company.
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
    await runner.query(`
      ALTER TABLE rides ADD COLUMN IF NOT EXISTS platform_commission_pct NUMERIC(5,2) NULL
    `);
    await runner.query(`
      CREATE TABLE IF NOT EXISTS company_commission_payments (
        id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id           UUID NOT NULL,
        amount               NUMERIC(10,2) NOT NULL,
        note                 VARCHAR(300) NULL,
        recorded_by_admin_id UUID NOT NULL,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_commission_payments_company
        ON company_commission_payments (company_id, created_at)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS company_commission_payments`);
    await runner.query(`ALTER TABLE rides DROP COLUMN IF EXISTS platform_commission_pct`);
    await runner.query(`
      ALTER TABLE companies
        DROP COLUMN IF EXISTS billing_model,
        DROP COLUMN IF EXISTS platform_commission_pct,
        DROP COLUMN IF EXISTS billing_model_set_at
    `);
  }
}

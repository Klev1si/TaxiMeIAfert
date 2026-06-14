import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow companies to own promo codes. NULL company_id keeps the existing
 * "global / admin-issued" semantics; non-NULL means the code only
 * discounts rides where the assigned driver belongs to that company.
 */
export class AddCompanyIdToPromoCodes1778600000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE promo_codes
        ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_codes_company_id
        ON promo_codes (company_id)
        WHERE company_id IS NOT NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS idx_promo_codes_company_id`);
    await runner.query(`ALTER TABLE promo_codes DROP COLUMN IF EXISTS company_id`);
  }
}

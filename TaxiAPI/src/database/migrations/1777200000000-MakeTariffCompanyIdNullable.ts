import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeTariffCompanyIdNullable1777200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing FK constraint first, then alter the column,
    // then re-add the FK as DEFERRABLE so NULL values are allowed.
    await queryRunner.query(`
      ALTER TABLE "tariffs"
        DROP CONSTRAINT IF EXISTS "FK_tariffs_company_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "tariffs"
        ALTER COLUMN "company_id" DROP NOT NULL
    `);

    // Re-add FK (nullable — ON DELETE SET NULL so rows survive company deletion)
    await queryRunner.query(`
      ALTER TABLE "tariffs"
        ADD CONSTRAINT "FK_tariffs_company_id"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove global tariffs before reverting (they have no company)
    await queryRunner.query(`
      DELETE FROM "tariffs" WHERE "company_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "tariffs"
        DROP CONSTRAINT IF EXISTS "FK_tariffs_company_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "tariffs"
        ALTER COLUMN "company_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "tariffs"
        ADD CONSTRAINT "FK_tariffs_company_id"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE CASCADE
    `);
  }
}

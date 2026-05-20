import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoShowField1777700000000 implements MigrationInterface {
  name = 'AddNoShowField1777700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Extend the user_role enum with the values we need (they already exist, so this is a no-op if run twice)
    await queryRunner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS no_show_reported_by VARCHAR(20) DEFAULT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rides DROP COLUMN IF EXISTS no_show_reported_by
    `);
  }
}

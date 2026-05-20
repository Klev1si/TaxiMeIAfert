import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancellationFee1777600000000 implements MigrationInterface {
  name = 'AddCancellationFee1777600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(10,2) DEFAULT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rides DROP COLUMN IF EXISTS cancellation_fee
    `);
  }
}

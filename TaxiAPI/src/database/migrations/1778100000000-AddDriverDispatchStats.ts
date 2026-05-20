import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverDispatchStats1778100000000 implements MigrationInterface {
  name = 'AddDriverDispatchStats1778100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS total_accepted INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_declined INT NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE drivers
        DROP COLUMN IF EXISTS total_accepted,
        DROP COLUMN IF EXISTS total_declined
    `);
  }
}

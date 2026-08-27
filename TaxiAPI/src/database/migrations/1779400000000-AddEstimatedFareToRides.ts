import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `estimated_fare` column to `rides`. The column was introduced on
 * the Ride entity in the dynamic per-driver pricing work (PR #4) but no
 * migration was written, so production Postgres lacked the column and every
 * scheduled-ride dispatcher/reminder query crashed with
 * `column ride.estimated_fare does not exist` (42703).
 *
 * Matches the entity: @Column({ type: 'decimal', precision: 10, scale: 2,
 * nullable: true }).
 */
export class AddEstimatedFareToRides1779400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS estimated_fare NUMERIC(10,2) NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE rides DROP COLUMN IF EXISTS estimated_fare`);
  }
}

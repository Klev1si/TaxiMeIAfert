import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-driver approximate fare, computed at dispatch time from the offered
 * driver's tariff and the pickup → dropoff distance. Stored so it survives
 * reconnects and is returned by GET /rides/active. Recomputed on every
 * re-dispatch (decline) with the next driver's tariff.
 */
export class AddEstimatedFareToRides1779400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS estimated_fare NUMERIC(10, 2) NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE rides DROP COLUMN IF EXISTS estimated_fare`);
  }
}

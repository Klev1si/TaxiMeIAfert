import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One-time public tracking token per ride. Passenger taps "Share trip" →
 * we generate a random token and stamp it here. Anyone with the token can
 * call /public/rides/track/:token to read minimal ride state for the
 * duration of the ride.
 */
export class AddShareTokenToRides1778900000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) NULL
    `);
    await runner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_rides_share_token
        ON rides (share_token)
        WHERE share_token IS NOT NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS uq_rides_share_token`);
    await runner.query(`ALTER TABLE rides DROP COLUMN IF EXISTS share_token`);
  }
}

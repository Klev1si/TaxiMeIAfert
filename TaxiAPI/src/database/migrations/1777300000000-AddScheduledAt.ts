import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 65 — Scheduled rides
 * Adds a nullable `scheduled_at` column to the rides table.
 * When set to a future timestamp, the ride is held and dispatched
 * automatically by the scheduler when the time arrives.
 */
export class AddScheduledAt1777300000000 implements MigrationInterface {
  name = 'AddScheduledAt1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMPTZ NULL
    `);

    // Index for the scheduler query: find unassigned scheduled rides that are now due
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rides_scheduled_at"
      ON "rides" ("scheduled_at")
      WHERE "scheduled_at" IS NOT NULL AND "driver_id" IS NULL AND "status" = 'requested'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rides_scheduled_at"`);
    await queryRunner.query(`ALTER TABLE "rides" DROP COLUMN IF EXISTS "scheduled_at"`);
  }
}

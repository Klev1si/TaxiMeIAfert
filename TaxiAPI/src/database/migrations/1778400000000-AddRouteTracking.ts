import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRouteTracking1778400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // 1. Actual GPS-measured distance on the rides table
    await runner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS actual_distance_km DECIMAL(8,3)
    `);

    // 2. Waypoints table
    await runner.query(`
      CREATE TABLE IF NOT EXISTS ride_waypoints (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        ride_id     UUID        NOT NULL,
        lat         DECIMAL(9,6) NOT NULL,
        lng         DECIMAL(9,6) NOT NULL,
        recorded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Index for fast lookup by ride + time order (used by getRoute + finalizeRoute)
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_ride_waypoints_ride_id
        ON ride_waypoints (ride_id, recorded_at ASC)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS ride_waypoints`);
    await runner.query(`ALTER TABLE rides DROP COLUMN IF EXISTS actual_distance_km`);
  }
}

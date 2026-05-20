import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiStopRides1778500000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // 1. ride_stops — passenger-requested intermediate stops
    await runner.query(`
      CREATE TABLE IF NOT EXISTS ride_stops (
        id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        ride_id     UUID         NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
        sort_order  SMALLINT     NOT NULL,
        lat         DECIMAL(9,6) NOT NULL,
        lng         DECIMAL(9,6) NOT NULL,
        address     VARCHAR(300),
        reached_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_ride_stops_ride_id
        ON ride_stops (ride_id, sort_order ASC)
    `);

    // 2. target_audience column on subscription_plans
    //    Default 'company' preserves all existing plans.
    await runner.query(`
      ALTER TABLE subscription_plans
        ADD COLUMN IF NOT EXISTS target_audience VARCHAR(20) NOT NULL DEFAULT 'company'
    `);

    // 3. driver_subscriptions table (mirrors company_subscriptions but for drivers)
    await runner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'driver_subscription_status_enum'
        ) THEN
          CREATE TYPE driver_subscription_status_enum AS ENUM ('active','trialing','past_due','cancelled');
        END IF;
      END $$
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS driver_subscriptions (
        id                    UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id             VARCHAR                         NOT NULL,
        plan_id               VARCHAR                         NOT NULL,
        stripe_subscription_id VARCHAR(200)                  UNIQUE,
        status                driver_subscription_status_enum NOT NULL DEFAULT 'trialing',
        current_period_start  TIMESTAMPTZ                    NOT NULL,
        current_period_end    TIMESTAMPTZ                    NOT NULL,
        cancelled_at          TIMESTAMPTZ,
        created_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW()
      )
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_subscriptions_driver_id
        ON driver_subscriptions (driver_id)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS driver_subscriptions`);
    await runner.query(`DROP TYPE IF EXISTS driver_subscription_status_enum`);
    await runner.query(`ALTER TABLE subscription_plans DROP COLUMN IF EXISTS target_audience`);
    await runner.query(`DROP TABLE IF EXISTS ride_stops`);
  }
}

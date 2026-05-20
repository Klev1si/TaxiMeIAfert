import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFraudEvents1778300000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS fraud_events (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        type       VARCHAR(60) NOT NULL,
        user_id    UUID,
        driver_id  UUID,
        ride_id    UUID,
        metadata   JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_events_type
        ON fraud_events (type)
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_events_created_at
        ON fraud_events (created_at DESC)
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_events_user_id
        ON fraud_events (user_id)
        WHERE user_id IS NOT NULL
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_events_driver_id
        ON fraud_events (driver_id)
        WHERE driver_id IS NOT NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS fraud_events`);
  }
}

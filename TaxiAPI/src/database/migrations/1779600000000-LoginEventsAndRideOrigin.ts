import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - `login_events`: one row per sign-in / sign-up / refresh-token exchange,
 *   with IP and device, so an admin can see which device used an account.
 * - `rides.is_test`: booked by a demo / reviewer account (DEMO_ACCOUNT_PHONES).
 * - `rides.request_ip` / `rides.request_device`: where the booking came from.
 */
export class LoginEventsAndRideOrigin1779600000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS login_events (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID NOT NULL,
        method           VARCHAR(20) NOT NULL,
        ip               VARCHAR(64) NULL,
        forwarded_for    VARCHAR(255) NULL,
        user_agent       VARCHAR(300) NULL,
        client_platform  VARCHAR(60) NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_login_events_user_created
        ON login_events (user_id, created_at)
    `);
    await runner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS is_test        BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS request_ip     VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS request_device VARCHAR(300) NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE rides
        DROP COLUMN IF EXISTS request_device,
        DROP COLUMN IF EXISTS request_ip,
        DROP COLUMN IF EXISTS is_test
    `);
    await runner.query(`DROP TABLE IF EXISTS login_events`);
  }
}

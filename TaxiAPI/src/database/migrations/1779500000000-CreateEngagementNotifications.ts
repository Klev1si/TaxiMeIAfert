import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Automatic engagement notifications (morning reminders for drivers,
 * win-backs for inactive users, weekly summaries):
 *  - users.last_active_at — last authenticated API call, bumped by JwtStrategy
 *  - users.engagement_notifications_enabled — per-user opt-out
 *  - engagement_notifications — send ledger for intervals / caps / rotation
 */
export class CreateEngagementNotifications1779500000000 implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS engagement_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

      CREATE TABLE IF NOT EXISTS engagement_notifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        VARCHAR(40) NOT NULL,
        message_key VARCHAR(60) NOT NULL,
        sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_engagement_notifications_user_type
        ON engagement_notifications (user_id, type, sent_at);
      CREATE INDEX IF NOT EXISTS idx_engagement_notifications_user_sent
        ON engagement_notifications (user_id, sent_at);
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DROP TABLE IF EXISTS engagement_notifications;
      ALTER TABLE users
        DROP COLUMN IF EXISTS engagement_notifications_enabled,
        DROP COLUMN IF EXISTS last_active_at;
    `);
  }
}

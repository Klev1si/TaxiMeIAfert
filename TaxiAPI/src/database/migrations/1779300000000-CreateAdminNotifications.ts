import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminNotifications1779300000000 implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type       VARCHAR(40)  NOT NULL,
        title      VARCHAR(200) NOT NULL,
        body       VARCHAR(500) NOT NULL,
        data       JSONB,
        is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
        ON admin_notifications (is_read, created_at);
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS admin_notifications`);
  }
}

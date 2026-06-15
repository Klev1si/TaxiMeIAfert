import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Direct messaging between a company and its drivers. Two-way chat: company
 * can DM each driver, driver can reply. `from_role` records who sent each
 * row so the recipient's unread count is computed as
 * `WHERE company_id = ? AND driver_id = ? AND from_role != my_role AND read_at IS NULL`.
 */
export class CreateCompanyMessages1778700000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DO $$ BEGIN
        CREATE TYPE company_message_from_role_enum AS ENUM ('company', 'driver');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS company_messages (
        id          UUID                              PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID                              NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        driver_id   UUID                              NOT NULL REFERENCES drivers(id)   ON DELETE CASCADE,
        from_role   company_message_from_role_enum    NOT NULL,
        text        TEXT                              NOT NULL,
        read_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ                       NOT NULL DEFAULT NOW()
      )
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_messages_thread
        ON company_messages (company_id, driver_id, created_at)
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_messages_unread
        ON company_messages (company_id, driver_id, read_at)
        WHERE read_at IS NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS idx_company_messages_unread`);
    await runner.query(`DROP INDEX IF EXISTS idx_company_messages_thread`);
    await runner.query(`DROP TABLE IF EXISTS company_messages`);
    await runner.query(`DROP TYPE IF EXISTS company_message_from_role_enum`);
  }
}

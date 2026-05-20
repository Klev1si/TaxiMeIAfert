import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportTables1778200000000 implements MigrationInterface {
  name = 'CreateSupportTables1778200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_category_enum') THEN
          CREATE TYPE ticket_category_enum AS ENUM
            ('ride_issue','payment','account','driver_behavior','app_bug','other');
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status_enum') THEN
          CREATE TYPE ticket_status_enum AS ENUM
            ('open','in_progress','resolved','closed');
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority_enum') THEN
          CREATE TYPE ticket_priority_enum AS ENUM
            ('low','normal','high','urgent');
        END IF;
      END $$
    `);

    // ── Tickets ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id          UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     VARCHAR               NOT NULL,
        user_role   VARCHAR(20)           NOT NULL,
        category    ticket_category_enum  NOT NULL,
        subject     VARCHAR(200)          NOT NULL,
        status      ticket_status_enum    NOT NULL DEFAULT 'open',
        priority    ticket_priority_enum  NOT NULL DEFAULT 'normal',
        ride_id     UUID,
        resolved_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
        ON support_tickets (user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_status
        ON support_tickets (status, priority, created_at DESC)
    `);

    // ── Messages ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id   UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        author_id   VARCHAR     NOT NULL,
        author_role VARCHAR(10) NOT NULL,
        body        TEXT        NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id
        ON support_messages (ticket_id, created_at ASC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS support_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_tickets`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_priority_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_category_enum`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1777900000000 implements MigrationInterface {
  name = 'CreateAuditLogs1777900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        admin_id    VARCHAR     NOT NULL,
        admin_phone VARCHAR(30),
        action      VARCHAR(80) NOT NULL,
        target_type VARCHAR(40) NOT NULL,
        target_id   VARCHAR(100),
        metadata    JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id
        ON audit_logs (admin_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
        ON audit_logs (created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_target
        ON audit_logs (target_type, target_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverDocuments1777800000000 implements MigrationInterface {
  name = 'CreateDriverDocuments1777800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type_enum') THEN
          CREATE TYPE document_type_enum AS ENUM
            ('license', 'vehicle_registration', 'insurance', 'other');
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status_enum') THEN
          CREATE TYPE document_status_enum AS ENUM ('pending', 'approved', 'rejected');
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS driver_documents (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        driver_id        UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        type             document_type_enum   NOT NULL,
        status           document_status_enum NOT NULL DEFAULT 'pending',
        file_url         VARCHAR(500) NOT NULL,
        original_name    VARCHAR(255),
        rejection_reason VARCHAR(500),
        reviewed_by      VARCHAR,
        reviewed_at      TIMESTAMPTZ,
        uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_documents_driver_id
        ON driver_documents (driver_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS driver_documents`);
    await queryRunner.query(`DROP TYPE IF EXISTS document_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS document_type_enum`);
  }
}

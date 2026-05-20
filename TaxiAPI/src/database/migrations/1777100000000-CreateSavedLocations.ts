import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSavedLocations1777100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "saved_locations" (
        "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
        "client_id"  UUID          NOT NULL,
        "label"      VARCHAR(40)   NOT NULL,
        "address"    VARCHAR(200)  NULL,
        "lat"        DECIMAL(10,7) NOT NULL,
        "lng"        DECIMAL(10,7) NOT NULL,
        "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_saved_locations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_saved_locations_client"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_saved_locations_client_id"
       ON "saved_locations" ("client_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "saved_locations"`);
  }
}

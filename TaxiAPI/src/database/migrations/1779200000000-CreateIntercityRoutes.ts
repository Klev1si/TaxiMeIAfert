import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIntercityRoutes1779200000000 implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS intercity_routes (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type     VARCHAR(10)      NOT NULL,
        owner_id       VARCHAR          NOT NULL,
        from_city      VARCHAR(80)      NOT NULL,
        from_lat       DOUBLE PRECISION NOT NULL,
        from_lng       DOUBLE PRECISION NOT NULL,
        from_radius_km NUMERIC(5,2)     NOT NULL DEFAULT 8,
        to_city        VARCHAR(80)      NOT NULL,
        to_lat         DOUBLE PRECISION NOT NULL,
        to_lng         DOUBLE PRECISION NOT NULL,
        to_radius_km   NUMERIC(5,2)     NOT NULL DEFAULT 8,
        flat_fare      NUMERIC(10,2)    NOT NULL,
        bidirectional  BOOLEAN          NOT NULL DEFAULT TRUE,
        is_active      BOOLEAN          NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_intercity_routes_owner
        ON intercity_routes (owner_type, owner_id);

      CREATE INDEX IF NOT EXISTS idx_intercity_routes_active
        ON intercity_routes (is_active) WHERE is_active = TRUE;
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS intercity_routes`);
  }
}

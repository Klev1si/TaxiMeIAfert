import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverLedger1778000000000 implements MigrationInterface {
  name = 'CreateDriverLedger1778000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS driver_ledger (
        id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        driver_id      UUID         NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        type           VARCHAR(10)  NOT NULL CHECK (type IN ('credit','payout')),
        amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
        ride_id        UUID         REFERENCES rides(id) ON DELETE SET NULL,
        commission_pct NUMERIC(5,2),
        note           VARCHAR(300),
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_ledger_driver_id
        ON driver_ledger (driver_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_ledger_ride_id
        ON driver_ledger (ride_id) WHERE ride_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS driver_ledger`);
  }
}

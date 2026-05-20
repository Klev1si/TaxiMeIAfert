import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 89 - Vehicle Types
 *
 * Adds Economy / Comfort / XL vehicle types to drivers, tariffs, and rides.
 */
export class AddVehicleTypes1777500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_type_enum') THEN
          CREATE TYPE vehicle_type_enum AS ENUM ('economy', 'comfort', 'xl');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS vehicle_type vehicle_type_enum NULL DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE tariffs
        ADD COLUMN IF NOT EXISTS vehicle_type vehicle_type_enum NULL DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS vehicle_type vehicle_type_enum NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rides DROP COLUMN IF EXISTS vehicle_type`);
    await queryRunner.query(`ALTER TABLE tariffs DROP COLUMN IF EXISTS vehicle_type`);
    await queryRunner.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS vehicle_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS vehicle_type_enum`);
  }
}
import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds driver_commission_pct to companies.
 * Default 70.00 = drivers keep 70% of every fare, company keeps 30%.
 */
export class AddDriverCommissionPct1777070108521 implements MigrationInterface {
    name = 'AddDriverCommissionPct1777070108521';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "driver_commission_pct" numeric(5,2) NOT NULL DEFAULT 70.00`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "companies" DROP COLUMN IF EXISTS "driver_commission_pct"`
        );
    }
}

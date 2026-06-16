import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a stable Apple user identifier (sub) to users so we can link
 * Sign-in-with-Apple identities the same way we link Google identities
 * via google_sub. Nullable + unique so existing users are unaffected.
 */
export class AddAppleSubToUsers1778800000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS apple_sub VARCHAR(255) NULL
    `);
    // UNIQUE constraint as a partial index so multiple NULLs are allowed.
    await runner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_apple_sub
        ON users (apple_sub)
        WHERE apple_sub IS NOT NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS uq_users_apple_sub`);
    await runner.query(`ALTER TABLE users DROP COLUMN IF EXISTS apple_sub`);
  }
}

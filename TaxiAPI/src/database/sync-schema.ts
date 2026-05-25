/**
 * One-shot schema sync script.
 * Usage: set DB env vars, then run:
 *   npx ts-node -r tsconfig-paths/register src/database/sync-schema.ts
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from './data-source';

// Load .env.railway first with override:true so Railway values
// always win over any already-loaded .env values.
dotenv.config({ path: '.env.railway', override: true });
dotenv.config({ override: false }); // fallback for any missing vars

async function main() {
  console.log(`Connecting to ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}…`);
  await AppDataSource.initialize();
  console.log('Connected.');

  // The DB has a partially-applied schema (orphaned enum types from a
  // previous failed synchronize). Since there is no real data yet, the
  // safest fix is to wipe public schema and start clean.
  console.log('Resetting public schema…');
  await AppDataSource.query(`DROP SCHEMA public CASCADE`);
  await AppDataSource.query(`CREATE SCHEMA public`);
  await AppDataSource.query(`GRANT ALL ON SCHEMA public TO public`);
  await AppDataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  console.log('Schema reset. Running synchronize()…');

  await AppDataSource.synchronize();
  console.log('Done — all tables created/updated.');
  await AppDataSource.destroy();
  process.exit(0);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});

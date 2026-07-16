import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as Entities from '../entities';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'taxiapp',
  password: process.env.DB_PASSWORD ?? 'taxiapp_dev_password',
  database: process.env.DB_NAME ?? 'taxiapp_db',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  // Every class exported from src/entities (the filter drops the enums the
  // barrel also exports) — a hand-maintained list here had drifted behind
  // index.ts, which makes migration:generate emit DROPs for tables it
  // can't see.
  entities: Object.values(Entities).filter(
    (e) => typeof e === 'function',
  ) as Function[],
  migrations: [__dirname + '/migrations/*.ts'],
  migrationsTableName: 'migrations',
});

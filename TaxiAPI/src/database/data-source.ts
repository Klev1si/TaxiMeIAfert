import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import {
  User,
  Company,
  Driver,
  Client,
  SubscriptionPlan,
  CompanySubscription,
  Tariff,
  Ride,
  Expense,
} from '../entities';

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
  entities: [
    User,
    Company,
    Driver,
    Client,
    SubscriptionPlan,
    CompanySubscription,
    Tariff,
    Ride,
    Expense,
  ],
  migrations: [__dirname + '/migrations/*.ts'],
  migrationsTableName: 'migrations',
});

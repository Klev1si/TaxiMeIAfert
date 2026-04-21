import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
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
} from './entities';

@Module({
  imports: [
    // Load .env file globally
    ConfigModule.forRoot({ isGlobal: true }),

    // TypeORM — async so it can read env vars from ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'taxiapp'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME', 'taxiapp_db'),
        entities: [
          User, Company, Driver, Client,
          SubscriptionPlan, CompanySubscription,
          Tariff, Ride, Expense,
        ],
        synchronize: false,
        logging: config.get<string>('DB_LOGGING') === 'true',
        migrations: [__dirname + '/database/migrations/*.js'],
        migrationsRun: false,
      }),
    }),

    // Feature modules
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

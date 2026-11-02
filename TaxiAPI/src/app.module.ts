import { Module, NestModule, MiddlewareConsumer, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { HealthModule } from './health/health.module';
import { FraudModule } from './fraud/fraud.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { PhoneVerificationModule } from './phone-verification/phone-verification.module';
import { RegistrationModule } from './registration/registration.module';
import { GatewayModule } from './gateway/gateway.module';
import { GpsModule } from './gps/gps.module';
import { RidesModule } from './rides/rides.module';
import { AdminModule } from './admin/admin.module';
import { SavedLocationsModule } from './saved-locations/saved-locations.module';
import { ExpensesModule } from './expenses/expenses.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { IntercityRoutesModule } from './intercity-routes/intercity-routes.module';
import { PaymentsModule } from './payments/payments.module';
import { AppVersionModule } from './app-version/app-version.module';
import { DriverDocumentsModule } from './driver-documents/driver-documents.module';
import { DriverTariffModule } from './driver-tariff/driver-tariff.module';
import { ClientFavoritesModule } from './client-favorites/client-favorites.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
import { CompanyFinancesModule } from './company-finances/company-finances.module';
import { AdminFinancesModule } from './admin-finances/admin-finances.module';
import { WalletModule } from './wallet/wallet.module';
import { SupportModule } from './support/support.module';
import { CompanyMessagesModule } from './company-messages/company-messages.module';
import { SubscriptionCronModule } from './subscription-cron/subscription-cron.module';
import { EngagementNotificationsModule } from './engagement-notifications/engagement-notifications.module';
import { FirstRideOfferModule } from './first-ride-offer/first-ride-offer.module';
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
  SavedLocation,
  PromoCode,
  AuditLog,
  DriverDocument,
  DriverLedger,
  SupportTicket,
  SupportMessage,
  FraudEvent,
  RideWaypoint,
  RideStop,
  DriverSubscription,
  ClientFavoriteDriver,
  CompanySettlement,
  CompanyMessage,
  PlatformCredit,
  AdminNotification,
  IntercityRoute,
  SubscriptionNotification,
  EngagementNotification,
  PlatformSetting,
  PromoFingerprint,
} from './entities';

/**
 * In @nestjs/throttler v6 every named limiter applies to every guarded route.
 * The "strict" and "otp" limiters are meant only for routes that opt in with
 * @Throttle({ strict | otp: ... }) — without this, login was silently capped
 * by the 3/min OTP limiter, and a global guard would cap the whole API at it.
 */
const onlyWhereConfigured = (name: string) => (ctx: ExecutionContext): boolean => {
  const key = `THROTTLER:LIMIT${name}`;
  return Reflect.getMetadata(key, ctx.getHandler()) === undefined &&
         Reflect.getMetadata(key, ctx.getClass())   === undefined;
};

/** Local development: the dashboard, simulator and API all share 127.0.0.1,
 *  so the general limiter would throttle the developer. Real clients never
 *  come from loopback (main.ts trusts the proxy's X-Forwarded-For). */
const isLoopback = (ctx: ExecutionContext): boolean => {
  const ip: string = ctx.switchToHttp().getRequest()?.ip ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

@Module({
  imports: [
    // Load .env file globally — Joi schema validates required vars at startup
    // so the app refuses to start if a critical secret is missing.
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV:              Joi.string().valid('development', 'test', 'production').default('development'),
        PORT:                  Joi.number().default(3000),
        // Database
        DB_HOST:               Joi.string().required(),
        DB_PORT:               Joi.number().default(5432),
        DB_USERNAME:           Joi.string().required(),
        DB_PASSWORD:           Joi.string().required(),
        DB_NAME:               Joi.string().required(),
        // Redis — Railway plugin exposes REDIS_URL; individual vars are fallback
        REDIS_URL:             Joi.string().optional().allow(''),
        REDIS_PRIVATE_URL:     Joi.string().optional().allow(''),
        REDIS_HOST:            Joi.string().optional().allow(''),
        REDIS_PORT:            Joi.number().default(6379),
        REDIS_PASSWORD:        Joi.string().optional().allow(''),
        // JWT — secrets must be at least 32 chars to prevent weak-secret attacks
        JWT_SECRET:            Joi.string().min(32).required(),
        JWT_EXPIRES_IN:        Joi.string().default('15m'),
        JWT_REFRESH_SECRET:    Joi.string().min(32).required(),
        JWT_REFRESH_EXPIRES_IN:Joi.string().default('30d'),
        // Database flags — Joi.boolean() coerces the string "true"/"false" to a
        // real boolean, so config.get<boolean>() returns the right type.
        DB_SYNCHRONIZE:        Joi.boolean().default(false),
        DB_LOGGING:            Joi.boolean().default(false),
        // CORS
        CORS_ORIGIN:           Joi.string().required(),
      }),
      validationOptions: {
        allowUnknown: true,  // extra vars (FIREBASE_, TWILIO_, etc.) are fine
        abortEarly:   false, // report all missing vars at once
      },
    }),

    // Rate limiting — applied globally via APP_GUARD below.
    // Two named limiters so sensitive endpoints can apply a stricter one
    // using @Throttle({ strict: { ... } }) without touching the default.
    ThrottlerModule.forRoot([
      {
        // "default" — general API protection
        // 200 requests per 60 seconds per IP
        name:  'default',
        ttl:   60_000,  // ms
        limit: 200,
        skipIf: isLoopback,
      },
      {
        // "strict" — auth / OTP / registration routes
        // 10 requests per 60 seconds per IP
        name:  'strict',
        ttl:   60_000,
        limit: 10,
        skipIf: onlyWhereConfigured('strict'),
      },
      {
        // "otp" — SMS send-otp route (prevent SMS-bombing)
        // 3 requests per 60 seconds per IP
        name:  'otp',
        ttl:   60_000,
        limit: 3,
        skipIf: onlyWhereConfigured('otp'),
      },
    ]),

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
          Tariff, Ride, Expense, SavedLocation, PromoCode,
          AuditLog,
          DriverDocument,
          DriverLedger,
          SupportTicket,
          SupportMessage,
          FraudEvent,
          RideWaypoint,
          RideStop,
          DriverSubscription,
          ClientFavoriteDriver,
          CompanySettlement,
          CompanyMessage,
          PlatformCredit,
          AdminNotification,
          IntercityRoute,
          SubscriptionNotification,
          EngagementNotification,
          PlatformSetting,
          PromoFingerprint,
        ],
        // Safety net: also register every entity passed to forFeature() by a
        // feature module, so a class missing from the list above can't cause
        // EntityMetadataNotFoundError at runtime.
        autoLoadEntities: true,
        // Joi.boolean() has already coerced the env string to a real boolean
        synchronize: config.get<boolean>('DB_SYNCHRONIZE', false),
        logging:     config.get<boolean>('DB_LOGGING', false),
        migrations: [__dirname + '/database/migrations/*.js'],
        migrationsRun: false,
      }),
    }),

    // Feature modules
    RedisModule,
    AuthModule,
    PhoneVerificationModule,
    RegistrationModule,
    GatewayModule,
    GpsModule,
    RidesModule,
    AdminModule,
    SavedLocationsModule,
    ExpensesModule,
    SubscriptionsModule,
    IntercityRoutesModule,
    PaymentsModule,
    AppVersionModule,
    DriverDocumentsModule,
    DriverTariffModule,
    ClientFavoritesModule,
    PasswordResetModule,
    CompanyFinancesModule,
    AdminFinancesModule,
    WalletModule,
    SupportModule,
    CompanyMessagesModule,
    SubscriptionCronModule,
    EngagementNotificationsModule,
    FirstRideOfferModule,
    HealthModule,
    FraudModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global rate limit: 200 req/min per client IP on every HTTP route.
    // Sensitive routes add the stricter "strict"/"otp" limiters on top via
    // @Throttle. Loopback (local development) is exempt from the general
    // limiter — see isLoopback above. Webhooks and health checks opt out.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}

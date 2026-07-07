import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client, Company, Driver, PlatformCredit, PromoCode, Ride, RideStop, Tariff, User } from '../entities/index.js';
import { DriverLedger } from '../entities/driver-ledger.entity.js';
import { GpsModule } from '../gps/gps.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { FraudModule } from '../fraud/fraud.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { IntercityRoutesModule } from '../intercity-routes/intercity-routes.module.js';
import { RidesService } from './rides.service.js';
import { RouteTrackerModule } from './route-tracker.module.js';
import { RidesController } from './rides.controller.js';
import { PublicRidesController } from './public-rides.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, Client, Ride, RideStop, User, Tariff, Company, PromoCode, DriverLedger, PlatformCredit]),
    GpsModule,
    NotificationsModule,
    MailerModule,
    WalletModule,
    FraudModule,
    SubscriptionsModule,
    IntercityRoutesModule,
    RouteTrackerModule,
  ],
  controllers: [RidesController, PublicRidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}

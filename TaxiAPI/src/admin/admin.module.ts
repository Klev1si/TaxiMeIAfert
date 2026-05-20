import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client, Company, CompanySubscription, Driver, PromoCode, Ride, SubscriptionPlan, Tariff, User } from '../entities';
import { GpsModule } from '../gps/gps.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { WalletModule } from '../wallet/wallet.module';
import { FraudModule } from '../fraud/fraud.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CompanyController } from './company.controller';
import { CompanyStatsController } from './company-stats.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, Driver, Client, Company, CompanySubscription, Tariff, User, SubscriptionPlan, PromoCode]),
    GpsModule,
    NotificationsModule,
    AuditModule,
    WalletModule,
    FraudModule,
  ],
  controllers: [AdminController, CompanyController, CompanyStatsController],
  providers: [AdminService],
})
export class AdminModule {}

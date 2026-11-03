import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company, CommissionPayment, Driver, Ride, User } from '../entities/index.js';
import { AuditModule } from '../audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CompanyBillingService } from './company-billing.service.js';
import { AdminCompanyBillingController, CompanyBillingController, DriverBillingController } from './company-billing.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, CommissionPayment, Driver, Ride, User]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [CompanyBillingController, DriverBillingController, AdminCompanyBillingController],
  providers: [CompanyBillingService],
  exports: [CompanyBillingService],
})
export class CompanyBillingModule {}

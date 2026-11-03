import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company, CompanyCommissionPayment, Driver, Ride, User } from '../entities/index.js';
import { AuditModule } from '../audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CompanyBillingService } from './company-billing.service.js';
import { AdminCompanyBillingController, CompanyBillingController } from './company-billing.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, CompanyCommissionPayment, Driver, Ride, User]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [CompanyBillingController, AdminCompanyBillingController],
  providers: [CompanyBillingService],
  exports: [CompanyBillingService],
})
export class CompanyBillingModule {}

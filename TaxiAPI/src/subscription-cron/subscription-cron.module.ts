import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Company,
  CompanySubscription,
  Driver,
  DriverSubscription,
  SubscriptionNotification,
  User,
} from '../entities/index.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { SmsModule } from '../sms/sms.module.js';
import { SubscriptionCronService } from './subscription-cron.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverSubscription,
      CompanySubscription,
      SubscriptionNotification,
      Driver,
      Company,
      User,
    ]),
    NotificationsModule,
    MailerModule,
    SmsModule,
  ],
  providers: [SubscriptionCronService],
  exports: [SubscriptionCronService],
})
export class SubscriptionCronModule {}

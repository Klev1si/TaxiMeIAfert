import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Company, CompanySubscription,
  Driver, DriverSubscription,
  SubscriptionPlan,
} from '../entities/index.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      CompanySubscription,
      DriverSubscription,
      Company,
      Driver,
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}

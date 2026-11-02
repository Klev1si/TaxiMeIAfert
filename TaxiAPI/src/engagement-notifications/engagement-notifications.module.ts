import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EngagementNotification } from '../entities/index.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { FirstRideOfferModule } from '../first-ride-offer/first-ride-offer.module.js';
import { EngagementNotificationsService } from './engagement-notifications.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EngagementNotification]), NotificationsModule, FirstRideOfferModule],
  providers: [EngagementNotificationsService],
  exports: [EngagementNotificationsService],
})
export class EngagementNotificationsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EngagementNotification } from '../entities/index.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EngagementNotificationsService } from './engagement-notifications.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EngagementNotification]), NotificationsModule],
  providers: [EngagementNotificationsService],
  exports: [EngagementNotificationsService],
})
export class EngagementNotificationsModule {}

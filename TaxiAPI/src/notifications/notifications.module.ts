import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminNotification, User } from '../entities/index.js';
import { NotificationsService } from './notifications.service.js';
import { AdminNotificationsService } from './admin-notifications.service.js';
import { AdminNotificationsController } from './admin-notifications.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([AdminNotification, User])],
  controllers: [AdminNotificationsController],
  providers: [NotificationsService, AdminNotificationsService],
  exports: [NotificationsService, AdminNotificationsService],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client, Driver, Ride, User } from '../entities/index.js';
import { GpsModule } from '../gps/gps.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RidesService } from './rides.service.js';
import { RidesController } from './rides.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, Client, Ride, User]),
    GpsModule,
    NotificationsModule,
  ],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}

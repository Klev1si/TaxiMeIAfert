import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company, CompanyMessage, Driver, User } from '../entities';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CompanyMessagesController } from './company-messages.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyMessage, Company, Driver, User]),
    GatewayModule,
    NotificationsModule,
  ],
  controllers: [CompanyMessagesController],
})
export class CompanyMessagesModule {}

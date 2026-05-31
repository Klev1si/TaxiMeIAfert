import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client, Driver, Ride, User } from '../entities/index.js';
import { GatewayModule } from '../gateway/gateway.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Ride, Client, Driver, User]),
    GatewayModule,
    NotificationsModule,
    WalletModule,
  ],
  controllers: [PaymentsController],
  providers:   [PaymentsService],
})
export class PaymentsModule {}

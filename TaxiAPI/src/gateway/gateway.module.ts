import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GpsModule } from '../gps/gps.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EventsGateway } from './events.gateway.js';
import { GatewayService } from './gateway.service.js';
import { WsAuthGuard } from './ws-auth.guard.js';
import { User } from '../entities/index.js';

/**
 * @Global so that GatewayService can be injected anywhere
 * (rides module, GPS module, etc.) without re-importing GatewayModule.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    GpsModule,
    NotificationsModule,
    TypeOrmModule.forFeature([User]),
  ],
  providers: [EventsGateway, GatewayService, WsAuthGuard],
  exports: [GatewayService, WsAuthGuard],
})
export class GatewayModule {}

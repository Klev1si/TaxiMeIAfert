import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client, PlatformSetting, PromoFingerprint, User } from '../entities/index.js';
import { AuditModule } from '../audit/audit.module.js';
import { FirstRideOfferService } from './first-ride-offer.service.js';
import { AdminFirstRideOfferController, FirstRideOfferController } from './first-ride-offer.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting, PromoFingerprint, Client, User]), AuditModule],
  controllers: [FirstRideOfferController, AdminFirstRideOfferController],
  providers: [FirstRideOfferService],
  exports: [FirstRideOfferService],
})
export class FirstRideOfferModule {}

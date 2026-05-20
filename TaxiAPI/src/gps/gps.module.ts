import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../entities/index.js';
import { FraudModule } from '../fraud/fraud.module.js';
import { RouteTrackerModule } from '../rides/route-tracker.module.js';
import { GpsService } from './gps.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Driver]), FraudModule, RouteTrackerModule],
  providers: [GpsService],
  exports: [GpsService],
})
export class GpsModule {}

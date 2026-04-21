import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../entities/index.js';
import { GpsModule } from '../gps/gps.module.js';
import { RidesService } from './rides.service.js';
import { RidesController } from './rides.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver]),
    GpsModule,
  ],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}

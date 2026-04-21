import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../entities/index.js';
import { GpsService } from './gps.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Driver])],
  providers: [GpsService],
  exports: [GpsService],
})
export class GpsModule {}

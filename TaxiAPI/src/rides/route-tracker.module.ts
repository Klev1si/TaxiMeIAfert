import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RideWaypoint } from '../entities/ride-waypoint.entity';
import { RouteTrackerService } from './route-tracker.service';

/**
 * Standalone module so GpsModule can import RouteTrackerService
 * without creating a circular dependency with RidesModule.
 */
@Module({
  imports:   [TypeOrmModule.forFeature([RideWaypoint])],
  providers: [RouteTrackerService],
  exports:   [RouteTrackerService],
})
export class RouteTrackerModule {}

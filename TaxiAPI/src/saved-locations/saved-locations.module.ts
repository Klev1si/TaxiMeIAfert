import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client, SavedLocation } from '../entities';
import { SavedLocationsService } from './saved-locations.service';
import { SavedLocationsController } from './saved-locations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SavedLocation, Client])],
  controllers: [SavedLocationsController],
  providers: [SavedLocationsService],
})
export class SavedLocationsModule {}

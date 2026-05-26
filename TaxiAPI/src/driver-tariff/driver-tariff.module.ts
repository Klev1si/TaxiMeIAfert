import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../entities/driver.entity';
import { Tariff } from '../entities/tariff.entity';
import { DriverTariffController } from './driver-tariff.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tariff, Driver])],
  controllers: [DriverTariffController],
})
export class DriverTariffModule {}

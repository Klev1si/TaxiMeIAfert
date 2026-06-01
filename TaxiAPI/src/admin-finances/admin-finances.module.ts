import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company, Driver, Ride } from '../entities';
import { AdminFinancesController } from './admin-finances.controller';
import { AdminFinancesService } from './admin-finances.service';

@Module({
  imports: [TypeOrmModule.forFeature([Driver, Company, Ride])],
  controllers: [AdminFinancesController],
  providers: [AdminFinancesService],
})
export class AdminFinancesModule {}

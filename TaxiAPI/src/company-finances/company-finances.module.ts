import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company, Driver, Expense, Ride } from '../entities';
import { CompanySettlement } from '../entities/company-settlement.entity';
import { CompanyFinancesController } from './company-finances.controller';
import { CompanyFinancesService } from './company-finances.service';

@Module({
  imports: [TypeOrmModule.forFeature([Company, Driver, Ride, Expense, CompanySettlement])],
  controllers: [CompanyFinancesController],
  providers: [CompanyFinancesService],
})
export class CompanyFinancesModule {}

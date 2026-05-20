import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver, Expense } from '../entities/index.js';
import { ExpensesService } from './expenses.service.js';
import { ExpensesController } from './expenses.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Driver])],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}

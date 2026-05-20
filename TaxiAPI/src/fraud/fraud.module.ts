import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FraudEvent } from '../entities/fraud-event.entity';
import { FraudService } from './fraud.service';

@Module({
  imports:   [TypeOrmModule.forFeature([FraudEvent])],
  providers: [FraudService],
  exports:   [FraudService],
})
export class FraudModule {}

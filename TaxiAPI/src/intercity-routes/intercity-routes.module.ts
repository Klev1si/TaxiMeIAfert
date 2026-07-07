import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company, Driver, IntercityRoute } from '../entities/index.js';
import { IntercityRoutesController } from './intercity-routes.controller.js';
import { IntercityRoutesService } from './intercity-routes.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([IntercityRoute, Driver, Company])],
  controllers: [IntercityRoutesController],
  providers: [IntercityRoutesService],
  exports: [IntercityRoutesService],
})
export class IntercityRoutesModule {}

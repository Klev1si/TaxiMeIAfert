import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSetting } from '../entities/index.js';
import { AuditModule } from '../audit/audit.module.js';
import { PlatformFeesService } from './platform-fees.service.js';
import { PlatformFeesController } from './platform-fees.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting]), AuditModule],
  controllers: [PlatformFeesController],
  providers: [PlatformFeesService],
  exports: [PlatformFeesService],
})
export class PlatformFeesModule {}

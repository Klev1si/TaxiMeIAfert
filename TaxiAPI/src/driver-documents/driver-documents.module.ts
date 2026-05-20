import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver, User } from '../entities';
import { DriverDocument } from '../entities/driver-document.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { DriverDocumentsService } from './driver-documents.service';
import { AdminDocumentsController, DriverDocumentsController } from './driver-documents.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverDocument, Driver, User]),
    NotificationsModule,
    AuditModule,
  ],
  controllers: [DriverDocumentsController, AdminDocumentsController],
  providers: [DriverDocumentsService],
})
export class DriverDocumentsModule {}

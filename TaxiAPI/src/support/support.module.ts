import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from '../entities/support-ticket.entity';
import { SupportMessage } from '../entities/support-message.entity';
import { User } from '../entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportService } from './support.service';
import { AdminSupportController, SupportController } from './support.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, SupportMessage, User]),
    NotificationsModule,
  ],
  controllers: [SupportController, AdminSupportController],
  providers:   [SupportService],
})
export class SupportModule {}

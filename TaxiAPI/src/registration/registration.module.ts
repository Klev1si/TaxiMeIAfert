import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Client, Driver, Company } from '../entities/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { PhoneVerificationModule } from '../phone-verification/phone-verification.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RegistrationService } from './registration.service.js';
import { RegistrationController } from './registration.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Client, Driver, Company]),
    AuthModule,
    PhoneVerificationModule,
    NotificationsModule,
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
})
export class RegistrationModule {}

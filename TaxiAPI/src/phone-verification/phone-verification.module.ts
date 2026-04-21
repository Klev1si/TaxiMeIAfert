import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/index.js';
import { PhoneVerificationService } from './phone-verification.service.js';
import { PhoneVerificationController } from './phone-verification.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [PhoneVerificationController],
  providers: [PhoneVerificationService],
  // Export so RegistrationModule (Step 14) can call isPhoneVerified()
  exports: [PhoneVerificationService],
})
export class PhoneVerificationModule {}

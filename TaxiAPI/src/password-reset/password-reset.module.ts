import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/index.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { PhoneVerificationModule } from '../phone-verification/phone-verification.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetService } from './password-reset.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    MailerModule,
    PhoneVerificationModule,
    RedisModule,
  ],
  controllers: [PasswordResetController],
  providers: [PasswordResetService],
})
export class PasswordResetModule {}

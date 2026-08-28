import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PhoneVerificationService } from './phone-verification.service.js';
import { SendOtpDto } from './dto/send-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { User } from '../entities/index.js';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class PhoneVerificationController {
  constructor(
    private readonly phoneVerificationService: PhoneVerificationService,
  ) {}

  // POST /auth/send-otp
  // Strict OTP limit: max 3 SMS per minute per IP — prevents SMS-bombing
  @Post('send-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ otp: { limit: 3, ttl: 60_000 } })
  sendOtp(@Body() dto: SendOtpDto): Promise<void> {
    return this.phoneVerificationService.sendOtp(dto.phone);
  }

  // POST /auth/verify-otp
  // Strict limit: max 10 attempts per minute to prevent brute-force
  @Post('verify-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<void> {
    return this.phoneVerificationService.verifyOtp(dto.phone, dto.code);
  }

  // POST /auth/attach-phone
  // Authenticated: attach a freshly-verified phone to the CURRENT account.
  // This is how Google/Apple clients — who register without a phone — add one
  // after signup. Request a code first via POST /auth/send-otp, then submit it
  // here. Body: { phone, code }. Same strict brute-force limit as verify-otp.
  @Post('attach-phone')
  @UseGuards(JwtAuthGuard)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  attachPhone(
    @CurrentUser() user: User,
    @Body() dto: VerifyOtpDto,
  ): Promise<{ phone: string; isPhoneVerified: boolean }> {
    return this.phoneVerificationService.attachPhoneToUser(
      user.id,
      dto.phone,
      dto.code,
    );
  }
}

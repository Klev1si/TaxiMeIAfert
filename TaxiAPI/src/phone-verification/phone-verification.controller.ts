import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { PhoneVerificationService } from './phone-verification.service.js';
import { SendOtpDto } from './dto/send-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';

@Controller('auth')
export class PhoneVerificationController {
  constructor(
    private readonly phoneVerificationService: PhoneVerificationService,
  ) {}

  // POST /auth/send-otp
  @Post('send-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  sendOtp(@Body() dto: SendOtpDto): Promise<void> {
    return this.phoneVerificationService.sendOtp(dto.phone);
  }

  // POST /auth/verify-otp
  @Post('verify-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<void> {
    return this.phoneVerificationService.verifyOtp(dto.phone, dto.code);
  }
}

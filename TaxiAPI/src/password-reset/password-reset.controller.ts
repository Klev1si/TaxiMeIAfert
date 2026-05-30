import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { PasswordResetService, ResetMethod } from './password-reset.service';

class ForgotPasswordDto {
  @IsEnum(['email', 'sms'] as const)
  method: ResetMethod;

  /** Email address or phone (E.164) depending on `method`. */
  @IsString() @MinLength(3) @MaxLength(255)
  identifier: string;
}

class ResetPasswordDto {
  @IsEnum(['email', 'sms'] as const)
  method: ResetMethod;

  @IsString() @MinLength(3) @MaxLength(255)
  identifier: string;

  @IsString() @MinLength(4) @MaxLength(10)
  code: string;

  @IsString() @MinLength(6) @MaxLength(128)
  newPassword: string;
}

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class PasswordResetController {
  constructor(private readonly svc: PasswordResetService) {}

  /**
   * POST /auth/forgot-password
   * Always returns 204 No Content, even if the email/phone doesn't match a
   * registered account — prevents enumeration. Strictly rate-limited.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  async forgot(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.svc.sendResetCode(dto.method, dto.identifier);
  }

  /**
   * POST /auth/reset-password
   * Verifies the code and saves the new password. Strict rate limit.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  async reset(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.svc.resetPassword(dto.method, dto.identifier, dto.code, dto.newPassword);
  }
}

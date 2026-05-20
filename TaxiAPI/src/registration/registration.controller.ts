import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { RegistrationService } from './registration.service.js';
import { RegisterClientDto } from './dto/register-client.dto.js';
import { RegisterDriverDto } from './dto/register-driver.dto.js';
import { RegisterCompanyDto } from './dto/register-company.dto.js';
import { AuthTokensDto } from '../auth/dto/auth-tokens.dto.js';

// All registration endpoints share the strict throttle:
// max 5 accounts per minute per IP — prevents mass account creation
@Controller('auth/register')
@UseGuards(ThrottlerGuard)
@Throttle({ strict: { limit: 5, ttl: 60_000 } })
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  // POST /auth/register/client
  // Phone must be verified first. Auto-approves → returns JWT tokens.
  @Post('client')
  @HttpCode(HttpStatus.CREATED)
  registerClient(@Body() dto: RegisterClientDto): Promise<AuthTokensDto> {
    return this.registrationService.registerClient(dto);
  }

  // POST /auth/register/driver
  // Phone must be verified first. Requires admin approval → returns pending message.
  @Post('driver')
  @HttpCode(HttpStatus.CREATED)
  registerDriver(
    @Body() dto: RegisterDriverDto,
  ): Promise<{ message: string }> {
    return this.registrationService.registerDriver(dto);
  }

  // POST /auth/register/company
  // Phone must be verified first. Requires admin approval → returns pending message.
  @Post('company')
  @HttpCode(HttpStatus.CREATED)
  registerCompany(
    @Body() dto: RegisterCompanyDto,
  ): Promise<{ message: string }> {
    return this.registrationService.registerCompany(dto);
  }
}

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RegistrationService } from './registration.service.js';
import { RegisterClientDto } from './dto/register-client.dto.js';
import { RegisterDriverDto } from './dto/register-driver.dto.js';
import { RegisterCompanyDto } from './dto/register-company.dto.js';
import { AuthTokensDto } from '../auth/dto/auth-tokens.dto.js';

@Controller('auth/register')
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

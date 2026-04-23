import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Client, Driver, User } from '../entities';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    @InjectRepository(User)   private readonly userRepo: Repository<User>,
  ) {}

  // GET /auth/me — returns profile for the authenticated user
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: User) {
    if (user.role === 'driver') {
      const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
      return {
        id: user.id, phone: user.phone, role: user.role,
        firstName: driver?.firstName ?? null,
        lastName:  driver?.lastName  ?? null,
        rating:    driver?.rating    ?? null,
        isApproved: driver?.isApproved ?? false,
        licenseNumber: driver?.licenseNumber ?? null,
        vehicleMake:   driver?.vehicleMake   ?? null,
        vehicleModel:  driver?.vehicleModel  ?? null,
        vehiclePlate:  driver?.vehiclePlate  ?? null,
        vehicleColor:  driver?.vehicleColor  ?? null,
        vehicleYear:   driver?.vehicleYear   ?? null,
      };
    }
    const client = await this.clientRepo.findOne({ where: { userId: user.id } });
    return {
      id: user.id, phone: user.phone, role: user.role,
      firstName: client?.firstName ?? null,
      lastName:  client?.lastName  ?? null,
      rating:    client?.rating    ?? null,
    };
  }

  // POST /auth/login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.authService.login(dto);
  }

  // POST /auth/refresh  — requires valid refresh token in Authorization header
  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: User): Promise<AuthTokensDto> {
    return this.authService.refresh(user);
  }

  // POST /auth/logout  — requires valid access token
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: User): Promise<void> {
    return this.authService.logout(user.id);
  }
}

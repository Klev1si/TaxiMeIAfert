import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities';
import { LoginDto } from './dto/login.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.userRepo.findOne({
      where: { phone: dto.phone, isActive: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isPhoneVerified) {
      throw new ForbiddenException('Phone number not verified');
    }

    return this.issueTokens(user);
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  // Called after JwtRefreshGuard validates the refresh token
  async refresh(user: User): Promise<AuthTokensDto> {
    return this.issueTokens(user);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async logout(userId: string): Promise<void> {
    await this.userRepo.update(userId, { refreshToken: null });
  }

  // ── Validate password (used during registration) ───────────────────────────
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  // ── Token generation — also called by RegistrationService ─────────────────
  async issueTokens(user: User): Promise<AuthTokensDto> {
    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    };

    // Expiry as seconds (avoids ms StringValue type issues)
    const ACCESS_TTL = 15 * 60;          // 15 minutes
    const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 days

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: ACCESS_TTL,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TTL,
      }),
    ]);

    // Store hashed refresh token in DB
    const hashedRefresh = await bcrypt.hash(refreshToken, this.BCRYPT_ROUNDS);
    await this.userRepo.update(user.id, { refreshToken: hashedRefresh });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }
}

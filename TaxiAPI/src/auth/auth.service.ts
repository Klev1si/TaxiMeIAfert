import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { Client, User } from '../entities';
import { UserRole } from '../common/enums';
import { LoginDto } from './dto/login.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly BCRYPT_ROUNDS = 12;
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    // OAuth2Client without a constructor arg is used purely for verifying ID
    // tokens (no client_secret needed). We accept tokens issued for ANY of
    // the configured audiences below.
    this.googleClient = new OAuth2Client();
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.userRepo.findOne({
      where: { phone: dto.phone, isActive: true },
    });

    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isPhoneVerified) {
      throw new ForbiddenException('Phone number not verified');
    }

    return this.issueTokens(user);
  }

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  /**
   * Verify a Google ID token coming from the mobile SDK, then either log in
   * an existing user (matched by googleSub or email) or create a brand new
   * client account.
   *
   * Phone is left null until the user adds + verifies one in their profile.
   * The app gates ride booking on that step.
   */
  async googleSignIn(idToken: string): Promise<AuthTokensDto> {
    if (!idToken || idToken.length < 100) {
      throw new BadRequestException('Missing or malformed Google ID token');
    }

    // Audiences: every OAuth client id that may sign tokens for our app.
    // Web Client ID is the canonical one used by the Android SDK; iOS adds
    // its own. We accept any configured value.
    const audiences = [
      this.config.get<string>('GOOGLE_WEB_CLIENT_ID'),
      this.config.get<string>('GOOGLE_IOS_CLIENT_ID'),
      this.config.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
    ].filter((s): s is string => !!s);

    if (audiences.length === 0) {
      this.logger.error('No GOOGLE_*_CLIENT_ID env vars set — Google sign-in disabled');
      throw new BadRequestException('Google sign-in is not enabled on the server');
    }

    let payload: TokenPayload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const p = ticket.getPayload();
      if (!p) throw new Error('Empty payload from Google');
      payload = p;
    } catch (err) {
      this.logger.warn(`Google ID token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Could not verify Google account');
    }

    const googleSub = payload.sub;
    const email     = payload.email?.toLowerCase() ?? null;

    if (!googleSub) throw new UnauthorizedException('Google token missing sub claim');

    // 1. Try to find by stable Google sub (already linked)
    let user = await this.userRepo.findOne({ where: { googleSub, isActive: true } });

    // 2. Otherwise try by email — link the existing account
    if (!user && email) {
      user = await this.userRepo.findOne({ where: { email, isActive: true } });
      if (user) {
        user.googleSub = googleSub;
        // Auto-verify phone-less users so login isn't blocked by isPhoneVerified
        // (we'll require them to add a phone before booking a ride).
        if (!user.phone) user.isPhoneVerified = true;
        await this.userRepo.save(user);
      }
    }

    // 3. New user — create a CLIENT account. Phone/password stay null;
    //    they're prompted to add a phone in the profile flow.
    if (!user) {
      if (!email) throw new BadRequestException('Google account must expose an email address');

      user = this.userRepo.create({
        phone:        null,
        email,
        passwordHash: null,
        role:         UserRole.CLIENT,
        isPhoneVerified: true, // Google verified the identity, phone-add comes later
        googleSub,
        avatarUrl:    payload.picture ?? null,
      });
      user = await this.userRepo.save(user);

      const firstName = (payload.given_name ?? payload.name?.split(' ')[0] ?? 'User').trim();
      const lastName  = (payload.family_name ?? payload.name?.split(' ').slice(1).join(' ') ?? '').trim();
      const client = this.clientRepo.create({
        userId:    user.id,
        firstName,
        lastName:  lastName || '—',
      });
      await this.clientRepo.save(client);

      this.logger.log(`Google signup: created client ${user.id} (${email})`);
    } else {
      this.logger.log(`Google login: existing user ${user.id} (${user.email ?? user.phone})`);
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
      phone: user.phone ?? '',
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

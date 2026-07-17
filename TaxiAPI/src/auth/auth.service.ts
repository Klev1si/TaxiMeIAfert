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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appleSignin = require('apple-signin-auth') as {
  verifyIdToken: (
    idToken: string,
    options: { audience?: string | string[]; nonce?: string; ignoreExpiration?: boolean },
  ) => Promise<{ sub: string; email?: string; email_verified?: string | boolean; aud: string }>;
};
import { Client, User } from '../entities';
import { UserRole } from '../common/enums';
import { AdminNotificationsService } from '../notifications/admin-notifications.service';
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
    private readonly adminNotifications: AdminNotificationsService,
  ) {
    // OAuth2Client without a constructor arg is used purely for verifying ID
    // tokens (no client_secret needed). We accept tokens issued for ANY of
    // the configured audiences below.
    this.googleClient = new OAuth2Client();
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthTokensDto> {
    // Accept either { phone, password } (legacy callers) or
    // { identifier, password } (redesigned login screen with email/phone tabs).
    const raw = (dto.identifier ?? dto.phone ?? '').trim();
    if (!raw) throw new UnauthorizedException('Invalid credentials');

    const looksLikeEmail = raw.includes('@');
    const user = await this.userRepo.findOne({
      where: looksLikeEmail
        ? { email: raw.toLowerCase(), isActive: true }
        : { phone: raw, isActive: true },
    });

    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    // Phone-verified gate only applies to phone-registered users. Email/Google
    // users are auto-verified at signup so login isn't blocked for them.
    if (!user.isPhoneVerified && !looksLikeEmail) {
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

      void this.adminNotifications.notifyUserRegistered({
        userId: user.id,
        firstName,
        lastName,
        phone: null,
        email,
        role: UserRole.CLIENT,
      });
    } else {
      this.logger.log(`Google login: existing user ${user.id} (${user.email ?? user.phone})`);
    }

    return this.issueTokens(user);
  }

  // ── Apple Sign-In ──────────────────────────────────────────────────────────
  /**
   * Verify a Sign-in-with-Apple identity token coming from the iOS SDK, then
   * either log in an existing user (matched by appleSub or email) or create
   * a brand-new client account. Mirrors googleSignIn().
   *
   * Apple only sends the user's name on the FIRST sign-in, so the client is
   * expected to forward it as { firstName, lastName }; if missing we fall
   * back to a generic placeholder, which the user can edit later.
   *
   * Audience: the app's iOS bundle id. We accept any of the configured
   * APPLE_BUNDLE_ID / APPLE_SERVICE_ID values.
   */
  async appleSignIn(
    identityToken: string,
    firstName?: string,
    lastName?: string,
  ): Promise<AuthTokensDto> {
    if (!identityToken || identityToken.length < 100) {
      throw new BadRequestException('Missing or malformed Apple identity token');
    }

    const audiences = [
      this.config.get<string>('APPLE_BUNDLE_ID'),
      this.config.get<string>('APPLE_SERVICE_ID'),
    ].filter((s): s is string => !!s);

    if (audiences.length === 0) {
      this.logger.error('No APPLE_BUNDLE_ID env var set — Apple sign-in disabled');
      throw new BadRequestException('Apple sign-in is not enabled on the server');
    }

    let payload: { sub: string; email?: string };
    try {
      payload = await appleSignin.verifyIdToken(identityToken, {
        audience: audiences,
      });
    } catch (err) {
      this.logger.warn(`Apple identity token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Could not verify Apple account');
    }

    const appleSub = payload.sub;
    const email    = payload.email?.toLowerCase() ?? null;
    if (!appleSub) throw new UnauthorizedException('Apple token missing sub claim');

    // 1. Try to find by stable Apple sub (already linked)
    let user = await this.userRepo.findOne({ where: { appleSub, isActive: true } });

    // 2. Otherwise try by email (only for the very first sign-in — Apple may
    //    omit email on subsequent logins, but sub is stable)
    if (!user && email) {
      user = await this.userRepo.findOne({ where: { email, isActive: true } });
      if (user) {
        user.appleSub = appleSub;
        if (!user.phone) user.isPhoneVerified = true;
        await this.userRepo.save(user);
      }
    }

    // 3. New user — create a CLIENT account. Phone/password stay null;
    //    they're prompted to add a phone in the profile flow before booking.
    if (!user) {
      user = this.userRepo.create({
        phone:        null,
        email,
        passwordHash: null,
        role:         UserRole.CLIENT,
        isPhoneVerified: true, // Apple verified the identity
        appleSub,
      });
      user = await this.userRepo.save(user);

      const safeFirst = (firstName ?? '').trim() || 'Apple';
      const safeLast  = (lastName  ?? '').trim() || 'User';
      const client = this.clientRepo.create({
        userId:    user.id,
        firstName: safeFirst,
        lastName:  safeLast,
      });
      await this.clientRepo.save(client);

      this.logger.log(`Apple signup: created client ${user.id} (${email ?? 'email-private'})`);

      void this.adminNotifications.notifyUserRegistered({
        userId: user.id,
        firstName: safeFirst,
        lastName: safeLast,
        phone: null,
        email,
        role: UserRole.CLIENT,
      });
    } else {
      this.logger.log(`Apple login: existing user ${user.id} (${user.email ?? user.phone ?? 'apple-only'})`);
    }

    return this.issueTokens(user);
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  // Called after JwtRefreshGuard validates the refresh token
  async refresh(user: User): Promise<AuthTokensDto> {
    return this.issueTokens(user);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  // fcmToken is cleared here (server-side) because the app can't reliably do
  // it: by the time its user state is null, the auth tokens are already gone,
  // so a client-side clear PATCH would 401.
  async logout(userId: string): Promise<void> {
    await this.userRepo.update(userId, { refreshToken: null, fcmToken: null });
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

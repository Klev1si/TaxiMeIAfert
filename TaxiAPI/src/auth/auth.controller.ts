import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { In } from 'typeorm';
import { Ride } from '../entities';
import { RideStatus, UserRole } from '../common/enums/index.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { unlinkSync, mkdirSync, existsSync } from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IsString, IsOptional, MaxLength, MinLength, IsNotEmpty, IsInt, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Client, Company, Driver, User } from '../entities';

// ── Avatar upload config ──────────────────────────────────────────────────────
const AVATARS_DIR = join(process.cwd(), 'uploads', 'avatars');
if (!existsSync(AVATARS_DIR)) mkdirSync(AVATARS_DIR, { recursive: true });

const avatarStorage = diskStorage({
  destination: AVATARS_DIR,
  filename: (req, file, cb) => {
    const userId = (req as any).user?.id ?? 'unknown';
    const ext    = extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${userId}-${Date.now()}${ext}`);
  },
});

function avatarFileFilter(
  _req: any,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext     = extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only image files are allowed (jpg, png, webp)'), false);
  }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

class UpdateProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(80) @IsOptional()
  firstName?: string;

  @IsString() @IsNotEmpty() @MaxLength(80) @IsOptional()
  lastName?: string;

  /** Drivers only — update vehicle colour without requiring admin re-approval */
  @IsString() @MaxLength(40) @IsOptional()
  vehicleColor?: string;

  /**
   * Drivers only — vehicle make/model/year edits revoke `isApproved`. The
   * driver must wait for admin re-approval before they can accept rides.
   */
  @IsString() @IsNotEmpty() @MaxLength(60) @IsOptional()
  vehicleMake?: string;

  @IsString() @IsNotEmpty() @MaxLength(60) @IsOptional()
  vehicleModel?: string;

  @IsInt() @Min(1900) @Max(new Date().getFullYear() + 1) @IsOptional() @Type(() => Number)
  vehicleYear?: number;

  // ── Company-only fields ───────────────────────────────────────────────────
  /** Company name — changing this revokes `isApproved` until admin re-approves. */
  @IsString() @IsNotEmpty() @MaxLength(150) @IsOptional()
  companyName?: string;

  @IsString() @MaxLength(300) @IsOptional()
  address?: string;

  @IsString() @MaxLength(100) @IsOptional()
  city?: string;

  @IsString() @MaxLength(500) @IsOptional()
  logoUrl?: string;
}

class ChangePasswordDto {
  @IsString() @IsNotEmpty()
  currentPassword: string;

  @IsString() @MinLength(6) @MaxLength(64)
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @InjectRepository(Client)  private readonly clientRepo:  Repository<Client>,
    @InjectRepository(Driver)  private readonly driverRepo:  Repository<Driver>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(User)    private readonly userRepo:    Repository<User>,
    @InjectRepository(Ride)    private readonly rideRepo:    Repository<Ride>,
  ) {}

  // GET /auth/me — returns profile for the authenticated user
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: User) {
    if (user.role === 'driver') {
      const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
      return {
        id: user.id, phone: user.phone, email: user.email ?? null, role: user.role,
        avatarUrl: user.avatarUrl ?? null,
        firstName: driver?.firstName ?? null,
        lastName:  driver?.lastName  ?? null,
        rating:    driver?.rating != null ? Number(driver.rating) : null,
        isApproved: driver?.isApproved ?? false,
        licenseNumber: driver?.licenseNumber ?? null,
        vehicleMake:   driver?.vehicleMake   ?? null,
        vehicleModel:  driver?.vehicleModel  ?? null,
        vehiclePlate:  driver?.vehiclePlate  ?? null,
        vehicleColor:  driver?.vehicleColor  ?? null,
        vehicleYear:   driver?.vehicleYear   ?? null,
        vehicleType:   driver?.vehicleType   ?? null,
        // companyId — null = solo driver (manages own tariff + keeps 100%)
        companyId:     driver?.companyId     ?? null,
      };
    }
    if (user.role === 'company') {
      const company = await this.companyRepo.findOne({ where: { userId: user.id } });
      return {
        id: user.id, phone: user.phone, email: user.email ?? null, role: user.role,
        avatarUrl: user.avatarUrl ?? null,
        companyName: company?.name    ?? null,
        address:     company?.address ?? null,
        city:        company?.city    ?? null,
        logoUrl:     company?.logoUrl ?? null,
        isApproved:  company?.isApproved ?? false,
        driverCommissionPct: company?.driverCommissionPct != null
          ? Number(company.driverCommissionPct) : null,
      };
    }
    const client = await this.clientRepo.findOne({ where: { userId: user.id } });
    return {
      id: user.id, phone: user.phone, email: user.email ?? null, role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      firstName: client?.firstName ?? null,
      lastName:  client?.lastName  ?? null,
      rating:    client?.rating != null ? Number(client.rating) : null,
    };
  }

  // ── POST /auth/avatar — upload profile photo ────────────────────────────────
  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage:    avatarStorage,
      limits:     { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: avatarFileFilter,
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    if (!file) throw new BadRequestException('No file provided');

    // Delete previous avatar file to keep the uploads folder clean
    if (user.avatarUrl) {
      const oldPath = join(process.cwd(), user.avatarUrl);
      try { unlinkSync(oldPath); } catch { /* already deleted — ignore */ }
    }

    // Store the relative path; mobile prepends API_BASE_URL to build the full URL
    const avatarUrl = `uploads/avatars/${file.filename}`;
    await this.userRepo.update(user.id, { avatarUrl });
    return { avatarUrl };
  }

  // ── DELETE /auth/avatar — remove profile photo ──────────────────────────────
  @Delete('avatar')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAvatar(@CurrentUser() user: User): Promise<void> {
    if (!user.avatarUrl) return;
    const filePath = join(process.cwd(), user.avatarUrl);
    try { unlinkSync(filePath); } catch { /* file missing — ignore */ }
    await this.userRepo.update(user.id, { avatarUrl: null });
  }

  // POST /auth/login — strict: 10 attempts per minute per IP
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.authService.login(dto);
  }

  // POST /auth/google — exchange a Google ID token for our JWTs.
  // Creates a new client account when the user signs in for the first time.
  @Post('google')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  googleSignIn(@Body('idToken') idToken: string): Promise<AuthTokensDto> {
    return this.authService.googleSignIn(idToken);
  }

  // POST /auth/apple — exchange an Apple identity token for our JWTs.
  // Mirrors /auth/google. Body: { identityToken, firstName?, lastName? }.
  // Apple only sends name on the FIRST sign-in, so the client forwards it.
  @Post('apple')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  appleSignIn(
    @Body('identityToken') identityToken: string,
    @Body('firstName')     firstName?: string,
    @Body('lastName')      lastName?: string,
  ): Promise<AuthTokensDto> {
    return this.authService.appleSignIn(identityToken, firstName, lastName);
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

  // PATCH /auth/fcm-token — save/update Firebase Cloud Messaging token
  @Patch('fcm-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateFcmToken(
    @CurrentUser() user: User,
    @Body('fcmToken') fcmToken: string,
  ): Promise<void> {
    await this.userRepo.update(user.id, { fcmToken: fcmToken ?? null });
  }

  // PATCH /auth/email — let an existing account add or update their email
  // address. Required so legacy accounts (registered before email was
  // mandatory) can still use Forgot Password.
  @Patch('email')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async setEmail(
    @CurrentUser() user: User,
    @Body('email') rawEmail: string,
  ): Promise<void> {
    const email = (rawEmail ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('email must be a valid address');
    }
    // Uniqueness — don't let two users share the same email.
    const taken = await this.userRepo.findOne({ where: { email } });
    if (taken && taken.id !== user.id) {
      throw new ConflictException('An account with this email already exists');
    }
    await this.userRepo.update(user.id, { email });
  }

  // ── PATCH /auth/profile ────────────────────────────────────────────────────
  /**
   * Update the current user's profile (name, and vehicle colour for drivers).
   * Returns the updated profile in the same shape as GET /auth/me.
   */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    // ── Driver ────────────────────────────────────────────────────────────
    if (user.role === 'driver') {
      const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
      if (!driver) throw new BadRequestException('Driver profile not found');

      if (dto.firstName     !== undefined) driver.firstName    = dto.firstName.trim();
      if (dto.lastName      !== undefined) driver.lastName     = dto.lastName.trim();
      if (dto.vehicleColor  !== undefined) driver.vehicleColor = dto.vehicleColor.trim() || null;

      // Vehicle-identifying fields trigger admin re-approval. We compare
      // trimmed strings so a no-op edit (e.g., same value retyped) doesn't
      // unnecessarily block the driver from accepting rides.
      let needsReapproval = false;
      if (dto.vehicleMake !== undefined) {
        const v = dto.vehicleMake.trim();
        if (v !== driver.vehicleMake) { driver.vehicleMake = v; needsReapproval = true; }
      }
      if (dto.vehicleModel !== undefined) {
        const v = dto.vehicleModel.trim();
        if (v !== driver.vehicleModel) { driver.vehicleModel = v; needsReapproval = true; }
      }
      if (dto.vehicleYear !== undefined) {
        const v = dto.vehicleYear;
        if (v !== driver.vehicleYear) { driver.vehicleYear = v; needsReapproval = true; }
      }
      if (needsReapproval && driver.isApproved) {
        driver.isApproved = false;
        // If they're online, force them offline so dispatch stops sending rides.
        driver.isOnline = false;
      }
      await this.driverRepo.save(driver);

      return {
        id: user.id, phone: user.phone, email: user.email ?? null, role: user.role,
        avatarUrl: user.avatarUrl ?? null,
        firstName:   driver.firstName,
        lastName:    driver.lastName,
        rating:      driver.rating != null ? Number(driver.rating) : null,
        isApproved:  driver.isApproved,
        licenseNumber: driver.licenseNumber,
        vehicleMake:  driver.vehicleMake,
        vehicleModel: driver.vehicleModel,
        vehiclePlate: driver.vehiclePlate,
        vehicleColor: driver.vehicleColor,
        vehicleYear:  driver.vehicleYear,
        vehicleType:  driver.vehicleType,
        companyId:    driver.companyId,
      };
    }

    // ── Company ───────────────────────────────────────────────────────────
    if (user.role === 'company') {
      const company = await this.companyRepo.findOne({ where: { userId: user.id } });
      if (!company) throw new BadRequestException('Company profile not found');

      let needsReapproval = false;
      if (dto.companyName !== undefined) {
        const v = dto.companyName.trim();
        if (v !== company.name) { company.name = v; needsReapproval = true; }
      }
      if (dto.address !== undefined) company.address = dto.address.trim() || null;
      if (dto.city    !== undefined) company.city    = dto.city.trim()    || null;
      if (dto.logoUrl !== undefined) company.logoUrl = dto.logoUrl.trim() || null;

      if (needsReapproval && company.isApproved) {
        company.isApproved = false;
        company.approvedAt = null;
      }
      await this.companyRepo.save(company);

      return {
        id: user.id, phone: user.phone, email: user.email ?? null, role: user.role,
        avatarUrl: user.avatarUrl ?? null,
        companyName: company.name,
        address:     company.address,
        city:        company.city,
        logoUrl:     company.logoUrl,
        isApproved:  company.isApproved,
        driverCommissionPct: company.driverCommissionPct != null
          ? Number(company.driverCommissionPct) : null,
      };
    }

    // ── Client ────────────────────────────────────────────────────────────
    const client = await this.clientRepo.findOne({ where: { userId: user.id } });
    if (!client) throw new BadRequestException('Client profile not found');

    if (dto.firstName !== undefined) client.firstName = dto.firstName.trim();
    if (dto.lastName  !== undefined) client.lastName  = dto.lastName.trim();
    await this.clientRepo.save(client);

    return {
      id: user.id, phone: user.phone, email: user.email ?? null, role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      firstName: client.firstName,
      lastName:  client.lastName,
      rating:    client.rating != null ? Number(client.rating) : null,
    };
  }

  // ── PATCH /auth/change-password ────────────────────────────────────────────
  /**
   * Change the current user's password.
   * Requires the correct current password to prevent account takeover.
   */
  @Patch('change-password')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    if (!user.passwordHash) {
      throw new BadRequestException('This account has no password — sign in with Google instead.');
    }
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new ForbiddenException('Current password is incorrect');

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }

    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepo.update(user.id, { passwordHash: hash });
  }

  // ── DELETE /auth/account — GDPR account deletion ───────────────────────────
  /**
   * Permanently anonymises and deactivates the user's account.
   *
   * • Active/pending rides are cancelled (client) or the driver is taken offline.
   * • Personal data is replaced with a tombstone so relational integrity is kept
   *   while the user's identity is erased (GDPR Article 17 "right to erasure").
   * • The avatar file is deleted from disk.
   * • Refresh & FCM tokens are cleared so no further sessions can be started.
   */
  @Delete('account')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ strict: { limit: 3, ttl: 60_000 } })
  async deleteAccount(@CurrentUser() user: User): Promise<void> {
    // Use base36-encoded timestamp to keep the tombstone phone short enough
    // to fit the User.phone varchar(20) constraint. "del_" (4) + base36 ts
    // (~9 chars) = ~13 chars total — safely under the column limit.
    // Prior version used `deleted_${Date.now()}` which produced 21 chars
    // and silently failed at the DB layer, leaving the user record intact
    // and the account effectively un-deleted.
    const tombstone = `del_${Date.now().toString(36)}`;

    // Wrap the whole operation in a transaction so that, on any failure,
    // partial state (e.g., anonymised name but not deactivated user) doesn't
    // get committed and leave the account in an inconsistent state.
    await this.userRepo.manager.transaction(async (tx) => {
      // 1. Role-specific cleanup
      if (user.role === UserRole.CLIENT) {
        const client = await tx.getRepository(Client).findOne({ where: { userId: user.id } });
        if (client) {
          const activeStatuses = [
            RideStatus.REQUESTED,
            RideStatus.ACCEPTED,
            RideStatus.DRIVING_TO_PICKUP,
            RideStatus.IN_PROGRESS,
          ] as RideStatus[];
          await tx.getRepository(Ride).update(
            { clientId: client.id, status: In(activeStatuses) },
            {
              status:       RideStatus.CANCELLED,
              cancelledBy:  UserRole.CLIENT,
              cancelReason: 'Account deleted',
              cancelledAt:  new Date(),
            },
          );
          await tx.getRepository(Client).update(client.id, { firstName: 'Deleted', lastName: 'User' });
        }
      }

      if (user.role === UserRole.DRIVER) {
        const driver = await tx.getRepository(Driver).findOne({ where: { userId: user.id } });
        if (driver) {
          await tx.getRepository(Driver).update(driver.id, {
            isOnline:  false,
            firstName: 'Deleted',
            lastName:  'Driver',
          });
        }
      }

      if (user.role === UserRole.COMPANY) {
        const company = await tx.getRepository(Company).findOne({ where: { userId: user.id } });
        if (company) {
          await tx.getRepository(Company).update(company.id, {
            name:       'Deleted Company',
            address:    null,
            city:       null,
            logoUrl:    null,
            isApproved: false,
          });
        }
      }

      // 2. Delete avatar file from disk (best-effort)
      if (user.avatarUrl) {
        try { unlinkSync(join(process.cwd(), user.avatarUrl)); } catch { /* already gone */ }
      }

      // 3. Anonymise the user record. This MUST succeed for the deletion to
      //    take effect — if it throws, the transaction rolls back everything.
      await tx.getRepository(User).update(user.id, {
        phone:        tombstone,
        email:        null,
        passwordHash: await bcrypt.hash(tombstone, 12),
        avatarUrl:    null,
        fcmToken:     null,
        refreshToken: null,
        isActive:     false,
      });
    });
  }
}

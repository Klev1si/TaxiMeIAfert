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
  IsString, IsOptional, MaxLength, MinLength, IsNotEmpty,
} from 'class-validator';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Client, Driver, User } from '../entities';

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
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    @InjectRepository(User)   private readonly userRepo: Repository<User>,
    @InjectRepository(Ride)   private readonly rideRepo:   Repository<Ride>,
  ) {}

  // GET /auth/me — returns profile for the authenticated user
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: User) {
    if (user.role === 'driver') {
      const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
      return {
        id: user.id, phone: user.phone, role: user.role,
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
    const client = await this.clientRepo.findOne({ where: { userId: user.id } });
    return {
      id: user.id, phone: user.phone, role: user.role,
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
    if (user.role === 'driver') {
      const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
      if (!driver) throw new BadRequestException('Driver profile not found');

      if (dto.firstName !== undefined) driver.firstName = dto.firstName.trim();
      if (dto.lastName  !== undefined) driver.lastName  = dto.lastName.trim();
      if (dto.vehicleColor !== undefined) driver.vehicleColor = dto.vehicleColor.trim() || null;
      await this.driverRepo.save(driver);

      return {
        id: user.id, phone: user.phone, role: user.role,
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
      };
    }

    // Client or company
    const client = await this.clientRepo.findOne({ where: { userId: user.id } });
    if (!client) throw new BadRequestException('Client profile not found');

    if (dto.firstName !== undefined) client.firstName = dto.firstName.trim();
    if (dto.lastName  !== undefined) client.lastName  = dto.lastName.trim();
    await this.clientRepo.save(client);

    return {
      id: user.id, phone: user.phone, role: user.role,
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
    const ts = Date.now();

    // 1. Role-specific cleanup
    if (user.role === UserRole.CLIENT) {
      const client = await this.clientRepo.findOne({ where: { userId: user.id } });
      if (client) {
        // Cancel rides that are still open
        const activeStatuses = [
          RideStatus.REQUESTED,
          RideStatus.ACCEPTED,
          RideStatus.DRIVING_TO_PICKUP,
          RideStatus.IN_PROGRESS,
        ] as RideStatus[];
        await this.rideRepo.update(
          { clientId: client.id, status: In(activeStatuses) },
          {
            status:       RideStatus.CANCELLED,
            cancelledBy:  UserRole.CLIENT,
            cancelReason: 'Account deleted',
            cancelledAt:  new Date(),
          },
        );
        // Anonymise name
        await this.clientRepo.update(client.id, { firstName: 'Deleted', lastName: 'User' });
      }
    }

    if (user.role === UserRole.DRIVER) {
      const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
      if (driver) {
        // Take driver offline so no rides are dispatched
        await this.driverRepo.update(driver.id, { isOnline: false });
        // Anonymise name
        await this.driverRepo.update(driver.id, { firstName: 'Deleted', lastName: 'Driver' });
      }
    }

    // 2. Delete avatar file from disk
    if (user.avatarUrl) {
      try { unlinkSync(join(process.cwd(), user.avatarUrl)); } catch { /* already gone */ }
    }

    // 3. Anonymise the user record
    await this.userRepo.update(user.id, {
      phone:        `deleted_${ts}`,   // must stay unique in the DB
      email:        null,
      passwordHash: await bcrypt.hash(`deleted_${ts}`, 12), // invalidate password
      avatarUrl:    null,
      fcmToken:     null,
      refreshToken: null,
      isActive:     false,
    });
  }
}

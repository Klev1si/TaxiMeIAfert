import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, Client, Driver, Company } from '../entities/index.js';
import { UserRole } from '../common/enums/index.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthTokensDto } from '../auth/dto/auth-tokens.dto.js';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service.js';
import { RegisterClientDto } from './dto/register-client.dto.js';
import { RegisterDriverDto } from './dto/register-driver.dto.js';
import { RegisterCompanyDto } from './dto/register-company.dto.js';

const PENDING_MESSAGE =
  'Registration successful. Your account is pending admin approval. ' +
  'You will be notified once it is reviewed.';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly phoneVerification: PhoneVerificationService,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Client registration ───────────────────────────────────────────────────
  // Client is auto-approved → returns JWT tokens immediately
  async registerClient(dto: RegisterClientDto): Promise<AuthTokensDto> {
    await this.assertPhoneVerified(dto.phone);
    const email = await this.assertPhoneAndEmailAvailable(dto.phone, dto.email);

    const passwordHash = await this.authService.hashPassword(dto.password);

    const user = await this.dataSource.transaction(async (em) => {
      const newUser = em.create(User, {
        phone: dto.phone,
        email,
        passwordHash,
        role: UserRole.CLIENT,
        isPhoneVerified: true,
        isActive: true,
      });
      await em.save(newUser);

      const client = em.create(Client, {
        userId: newUser.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
      });
      await em.save(client);

      return newUser;
    });

    await this.phoneVerification.clearVerifiedFlag(dto.phone);
    this.logger.log(`Client registered: ${user.phone} (id: ${user.id})`);

    return this.authService.issueTokens(user);
  }

  // ── Driver registration ───────────────────────────────────────────────────
  // Driver requires admin approval → returns pending message
  async registerDriver(dto: RegisterDriverDto): Promise<{ message: string }> {
    await this.assertPhoneVerified(dto.phone);
    const email = await this.assertPhoneAndEmailAvailable(dto.phone, dto.email);

    const passwordHash = await this.authService.hashPassword(dto.password);

    await this.dataSource.transaction(async (em) => {
      const user = em.create(User, {
        phone: dto.phone,
        email,
        passwordHash,
        role: UserRole.DRIVER,
        isPhoneVerified: true,
        isActive: true,
      });
      await em.save(user);

      const driver = em.create(Driver, {
        userId: user.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        licenseNumber: dto.licenseNumber,
        vehicleMake: dto.vehicleMake,
        vehicleModel: dto.vehicleModel,
        vehicleYear: dto.vehicleYear,
        vehiclePlate: dto.vehiclePlate,
        vehicleColor: dto.vehicleColor ?? null,
        vehicleType:  dto.vehicleType  ?? null,
        isApproved: false,
        isOnline: false,
      });
      await em.save(driver);

      return user;
    });

    await this.phoneVerification.clearVerifiedFlag(dto.phone);
    this.logger.log(`Driver registered (pending approval): ${dto.phone}`);

    return { message: PENDING_MESSAGE };
  }

  // ── Company registration ──────────────────────────────────────────────────
  // Company requires admin approval → returns pending message
  async registerCompany(
    dto: RegisterCompanyDto,
  ): Promise<{ message: string }> {
    await this.assertPhoneVerified(dto.phone);
    const email = await this.assertPhoneAndEmailAvailable(dto.phone, dto.email);

    const passwordHash = await this.authService.hashPassword(dto.password);

    await this.dataSource.transaction(async (em) => {
      const user = em.create(User, {
        phone: dto.phone,
        email,
        passwordHash,
        role: UserRole.COMPANY,
        isPhoneVerified: true,
        isActive: true,
      });
      await em.save(user);

      const company = em.create(Company, {
        userId: user.id,
        name: dto.companyName,
        address: dto.address ?? null,
        city: dto.city ?? null,
        isApproved: false,
      });
      await em.save(company);

      return user;
    });

    await this.phoneVerification.clearVerifiedFlag(dto.phone);
    this.logger.log(`Company registered (pending approval): ${dto.phone}`);

    return { message: PENDING_MESSAGE };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async assertPhoneVerified(phone: string): Promise<void> {
    const verified = await this.phoneVerification.isPhoneVerified(phone);
    if (!verified) {
      throw new BadRequestException(
        'Phone number has not been verified — call POST /auth/send-otp then POST /auth/verify-otp first',
      );
    }
  }

  /** Lowercase + trim so 'Foo@Bar.com' and ' foo@bar.com ' are treated the same.
   *  Returns a clear error instead of crashing if the field is missing — happens
   *  when an old mobile build (pre-v1.38) submits a registration without email. */
  private normaliseEmail(email: string | null | undefined): string {
    if (!email) {
      throw new BadRequestException(
        'Email is required. Please update the app to the latest version and try again.',
      );
    }
    return email.trim().toLowerCase();
  }

  /**
   * Single DB round-trip uniqueness check for phone + email. Returns the
   * normalised email. Throws a specific ConflictException pointing at the
   * field that was taken.
   */
  private async assertPhoneAndEmailAvailable(phone: string, rawEmail: string): Promise<string> {
    const email = this.normaliseEmail(rawEmail);
    const existing = await this.userRepo.findOne({
      where: [{ phone }, { email }],
      select: ['id', 'phone', 'email'],
    });
    if (existing) {
      throw new ConflictException(
        existing.phone === phone
          ? 'An account with this phone number already exists'
          : 'An account with this email already exists',
      );
    }
    return email;
  }
}

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Twilio } from 'twilio';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { User } from '../entities/index.js';
import { FraudService } from '../fraud/fraud.service.js';

interface OtpRecord {
  code: string;
  attempts: number;
}

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);

  // OTP lives for 5 minutes; users get max 3 guesses
  private readonly OTP_TTL_SECONDS = 300;
  private readonly MAX_ATTEMPTS = 3;
  // Must wait 60 s before requesting a fresh code
  private readonly RESEND_COOLDOWN_SECONDS = 60;
  // Verified-phone flag lasts 15 min (registration window)
  private readonly VERIFIED_TTL_SECONDS = 900;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly fraudService: FraudService,
  ) {}

  // ── Send OTP ───────────────────────────────────────────────────────────────
  async sendOtp(phone: string): Promise<void> {
    // Fraud: check if phone is locked due to too many failures
    const ttl = await this.fraudService.getLockoutTtl(phone);
    if (ttl !== null) {
      const minutes = Math.ceil(ttl / 60);
      throw new HttpException(
        `This number is temporarily locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Enforce resend cooldown: block if code was sent < 60 s ago
    const existing = await this.redis.get(this.otpKey(phone));
    if (existing) {
      const ttl = await this.redis.ttl(this.otpKey(phone));
      const elapsed = this.OTP_TTL_SECONDS - ttl;
      if (elapsed < this.RESEND_COOLDOWN_SECONDS) {
        const wait = this.RESEND_COOLDOWN_SECONDS - elapsed;
        throw new BadRequestException(
          `Please wait ${wait} second(s) before requesting a new code`,
        );
      }
    }

    const code = this.generateCode();
    const record: OtpRecord = { code, attempts: 0 };
    await this.redis.setex(
      this.otpKey(phone),
      this.OTP_TTL_SECONDS,
      JSON.stringify(record),
    );

    await this.deliverCode(phone, code);
  }

  // ── Verify OTP ────────────────────────────────────────────────────────────
  async verifyOtp(phone: string, code: string): Promise<void> {
    const raw = await this.redis.get(this.otpKey(phone));
    if (!raw) {
      throw new BadRequestException(
        'Verification code not found or has expired — request a new one',
      );
    }

    const record: OtpRecord = JSON.parse(raw) as OtpRecord;

    if (record.attempts >= this.MAX_ATTEMPTS) {
      await this.redis.del(this.otpKey(phone));
      throw new BadRequestException(
        'Too many failed attempts — request a new code',
      );
    }

    if (record.code !== code) {
      // Persist incremented attempt count with remaining TTL
      const remainingTtl = await this.redis.ttl(this.otpKey(phone));
      record.attempts++;
      await this.redis.setex(
        this.otpKey(phone),
        remainingTtl > 0 ? remainingTtl : 1,
        JSON.stringify(record),
      );
      // Fraud: accumulate global failure counter (may trigger lockout)
      const user = await this.userRepo.findOne({ where: { phone }, select: ['id'] });
      void this.fraudService.recordOtpFailure(phone, user?.id);

      const remaining = this.MAX_ATTEMPTS - record.attempts;
      throw new UnauthorizedException(
        `Invalid code — ${remaining} attempt(s) remaining`,
      );
    }

    // ✅ Code correct — clear failure counter
    await this.fraudService.clearOtpFailures(phone);
    await this.redis.del(this.otpKey(phone));

    // Mark phone as verified in Redis so registration can proceed
    await this.redis.setex(
      this.verifiedKey(phone),
      this.VERIFIED_TTL_SECONDS,
      '1',
    );

    // If the user already exists, flip the flag immediately
    await this.userRepo.update({ phone }, { isPhoneVerified: true });

    this.logger.log(`Phone verified: ${phone}`);
  }

  // ── Helper used by RegistrationService in Step 14 ─────────────────────────
  async isPhoneVerified(phone: string): Promise<boolean> {
    const flag = await this.redis.get(this.verifiedKey(phone));
    return flag === '1';
  }

  async clearVerifiedFlag(phone: string): Promise<void> {
    await this.redis.del(this.verifiedKey(phone));
  }

  // ── Private helpers ────────────────────────────────────────────────────────
  private otpKey(phone: string): string {
    return `otp:${phone}`;
  }

  private verifiedKey(phone: string): string {
    return `phone_verified:${phone}`;
  }

  private generateCode(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }

  private async deliverCode(phone: string, code: string): Promise<void> {
    const mock = this.config.get<string>('TWILIO_MOCK');
    if (mock === 'true') {
      this.logger.log(`[DEV OTP] ${phone} → code: ${code}`);
      return;
    }

    const client = new Twilio(
      this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );

    await client.messages.create({
      body: `Your TaxiApp code is: ${code}. Valid for 5 minutes.`,
      from: this.config.getOrThrow<string>('TWILIO_FROM_NUMBER'),
      to: phone,
    });

    this.logger.log(`OTP sent to ${phone}`);
  }
}

import {
  BadRequestException,
  ConflictException,
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
    await this.consumeOtp(phone, code);

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

  // ── Attach a verified phone to an existing account ────────────────────────
  /**
   * Attach a freshly-verified phone number to an already-authenticated user.
   * This is the flow OAuth (Google/Apple) clients use to add a phone AFTER
   * signup, since those providers never supply one. Verifies the OTP, guards
   * against a number already owned by a different account, then writes it onto
   * the user record. No existing rows are removed — only the caller's own user
   * record is updated in place.
   *
   * Returns the attached phone so the caller can refresh its UI.
   */
  async attachPhoneToUser(
    userId: string,
    phone: string,
    code: string,
  ): Promise<{ phone: string; isPhoneVerified: boolean }> {
    // 1. Validate + consume the OTP (throws the same errors as verifyOtp).
    await this.consumeOtp(phone, code);

    // 2. The phone column is UNIQUE. If another account already holds this
    //    number, refuse cleanly instead of hitting a DB constraint error.
    const owner = await this.userRepo.findOne({
      where: { phone },
      select: ['id'],
    });
    if (owner && owner.id !== userId) {
      throw new ConflictException(
        'This phone number is already linked to another account',
      );
    }

    // 3. Load the caller's own user record and attach the number.
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    user.phone = phone;
    user.isPhoneVerified = true;
    await this.userRepo.save(user);

    this.logger.log(`Phone ${phone} attached to user ${userId}`);
    return { phone, isPhoneVerified: true };
  }

  /**
   * Validate an OTP `code` for `phone`, consuming it on success. Throws the
   * same user-facing errors as the public verify flow (expired / too many
   * attempts / invalid), records fraud failures on a wrong code, and on
   * success deletes the stored code and clears the fraud counter. Shared by
   * verifyOtp() and attachPhoneToUser() so the checks stay single-sourced.
   */
  private async consumeOtp(phone: string, code: string): Promise<void> {
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

    // ✅ Code correct — clear failure counter and consume the code
    await this.fraudService.clearOtpFailures(phone);
    await this.redis.del(this.otpKey(phone));
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

  /**
   * Send an arbitrary SMS body to a phone number. Used by the password-reset
   * flow (and any other one-off transactional SMS) — shares the same Twilio
   * credentials and mock-mode behaviour as the OTP path.
   */
  async sendRawSms(phone: string, body: string): Promise<void> {
    await this.deliverSms(phone, body, '[DEV SMS]');
  }

  /** Public so password-reset and other OTP-style flows can share one impl. */
  generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async deliverCode(phone: string, code: string): Promise<void> {
    await this.deliverSms(
      phone,
      `Your TaxiApp code is: ${code}. Valid for 5 minutes.`,
      '[DEV OTP]',
      `OTP sent to`,
    );
  }

  /** Single Twilio path used by deliverCode + sendRawSms — avoids duplicating
   *  the mock-mode branch and the client construction. */
  private async deliverSms(phone: string, body: string, mockTag: string, sentLabel = 'SMS sent to'): Promise<void> {
    if (this.config.get<string>('TWILIO_MOCK') === 'true') {
      this.logger.log(`${mockTag} ${phone} → ${body}`);
      return;
    }
    const client = new Twilio(
      this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );
    try {
      await client.messages.create({
        body,
        from: this.config.getOrThrow<string>('TWILIO_FROM_NUMBER'),
        to:   phone,
      });
      this.logger.log(`${sentLabel} ${phone}`);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      const msg  = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Twilio send failed for ${phone} (code ${code}): ${msg}`);

      // Twilio code 21608 → trial account can't reach an unverified number.
      // Turn the 500 into a 400 with a message the user can act on.
      if (code === 21608) {
        throw new BadRequestException(
          'This phone number isn\'t verified in our SMS provider. The app owner needs to either verify your number in Twilio\'s console, or upgrade Twilio to a paid plan.',
        );
      }

      // Twilio code 21408 → SMS to this country is blocked by Twilio's
      // Messaging Geographic Permissions. Owner needs to enable the country
      // at https://console.twilio.com/ → Messaging → Settings → Geo permissions.
      if (code === 21408) {
        throw new BadRequestException(
          'SMS to this country is not enabled yet. Please contact support so we can enable your country in our SMS provider.',
        );
      }
      // Other Twilio errors → keep the original behaviour (500) so we still
      // notice them in alerting, but with a cleaner message bubbled up.
      throw new BadRequestException(`Could not send SMS: ${msg}`);
    }
  }
}

/**
 * PasswordResetService — Forgot-password / reset-password flow.
 *
 * The user picks email or SMS. We generate a 6-digit code, store it in Redis
 * keyed by the user's identifier (email or phone), and deliver it via the
 * matching channel. On submit, we verify the code and bcrypt-hash the new
 * password.
 *
 * Security properties:
 *   - Codes are random 6-digit numbers (1 in 1,000,000 guess chance per try)
 *   - Max 5 verification attempts per code (then the code is voided)
 *   - 10-minute TTL on each code (then auto-expires from Redis)
 *   - Resend cooldown of 60 s to prevent SMS/email spam
 *   - Enumeration-safe: we always return 200 success on "send" even if the
 *     identifier doesn't exist, so attackers can't probe which emails/phones
 *     are registered.
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { User } from '../entities/index.js';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service.js';
import { MailerService } from '../mailer/mailer.service.js';

export type ResetMethod = 'email' | 'sms';

interface ResetRecord {
  code:        string;
  userId:      string;
  attempts:    number;
  /** Unix ms — `Date.now()` at the time the code was issued. Lets us
   *  compute the resend cooldown without a separate TTL round-trip. */
  issuedAtMs:  number;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  private readonly TTL_SECONDS         = 10 * 60; // 10 min
  private readonly RESEND_COOLDOWN_SEC = 60;      // 60 s between sends
  private readonly MAX_ATTEMPTS        = 5;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly phoneVerification: PhoneVerificationService,
    private readonly mailer: MailerService,
  ) {}

  // ── Send reset code ────────────────────────────────────────────────────────
  async sendResetCode(method: ResetMethod, identifier: string): Promise<void> {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) throw new BadRequestException('Email or phone is required');

    const user = method === 'email'
      ? await this.userRepo.findOne({ where: { email: normalized } })
      : await this.userRepo.findOne({ where: { phone: normalized } });

    // Enumeration-safe — return success even if the user doesn't exist. The
    // attacker can't distinguish a typo from a real account. We do skip the
    // SMS/email send entirely so we don't waste money or alert the wrong
    // person.
    if (!user) {
      this.logger.debug(`Reset requested for unknown ${method}: ${normalized.slice(0, 6)}…`);
      return;
    }

    // Resend cooldown — prevents SMS/email flood. Read the existing record's
    // issuedAt instead of doing a separate TTL round-trip.
    const key = this.codeKey(method, normalized);
    const existing = await this.redis.get(key);
    if (existing) {
      try {
        const prev = JSON.parse(existing) as ResetRecord;
        const elapsedSec = Math.floor((Date.now() - prev.issuedAtMs) / 1000);
        if (elapsedSec < this.RESEND_COOLDOWN_SEC) {
          const wait = this.RESEND_COOLDOWN_SEC - elapsedSec;
          throw new BadRequestException(`Please wait ${wait} second(s) before requesting a new code`);
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // Corrupt JSON — fall through and overwrite.
      }
    }

    const code = this.phoneVerification.generateCode();
    const record: ResetRecord = { code, userId: user.id, attempts: 0, issuedAtMs: Date.now() };
    await this.redis.setex(key, this.TTL_SECONDS, JSON.stringify(record));

    // Fire-and-forget delivery so a slow SMTP/Twilio handshake doesn't keep
    // the mobile request open for 30+ s (the user would see "connection
    // lost"). The code is already in Redis — if delivery fails, the user
    // can retry from the same screen.
    if (method === 'email') {
      this.mailer.sendPasswordResetCode(normalized, code).catch((err) => {
        this.logger.error(
          `Email delivery failed for user ${user.id} (${normalized}): ${err?.message ?? err}`,
        );
      });
    } else {
      this.phoneVerification.sendRawSms(
        normalized,
        `TaxiApp password reset code: ${code}. Expires in 10 min. Don't share it.`,
      ).catch((err) => {
        this.logger.error(
          `SMS delivery failed for user ${user.id} (${normalized}): ${err?.message ?? err}`,
        );
      });
    }
    this.logger.log(`Password reset code dispatched via ${method} for user ${user.id}`);
  }

  // ── Verify and reset ───────────────────────────────────────────────────────
  async resetPassword(
    method:      ResetMethod,
    identifier:  string,
    code:        string,
    newPassword: string,
  ): Promise<void> {
    const normalized = identifier.trim().toLowerCase();
    if (newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const key = this.codeKey(method, normalized);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new UnauthorizedException('Code has expired. Please request a new one.');
    }

    const record: ResetRecord = JSON.parse(raw);
    if (record.attempts >= this.MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new UnauthorizedException('Too many wrong attempts. Please request a new code.');
    }

    if (record.code !== code.trim()) {
      record.attempts++;
      // KEEPTTL preserves the original expiry without a separate TTL read —
      // 1 round-trip instead of 2.
      await this.redis.set(key, JSON.stringify(record), 'KEEPTTL');
      const remaining = this.MAX_ATTEMPTS - record.attempts;
      throw new UnauthorizedException(
        `Incorrect code. ${remaining} attempt(s) left.`,
      );
    }

    // Code valid — update password
    const hash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.update({ id: record.userId }, { passwordHash: hash });

    // Clean up — invalidate this code
    await this.redis.del(key);
    this.logger.log(`Password reset successful for user ${record.userId}`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private codeKey(method: ResetMethod, identifier: string): string {
    return `reset:${method}:${identifier}`;
  }
}

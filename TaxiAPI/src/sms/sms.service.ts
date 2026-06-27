import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Provider-agnostic SMS sender. Currently uses Twilio; swap by changing
 * the implementation of `send()` (and the relevant env vars) without
 * touching any caller. Mock mode is on by default in dev.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly mockMode: boolean;
  private readonly fromNumber: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any | null = null;

  constructor(private readonly config: ConfigService) {
    this.mockMode = config.get<string>('SMS_MOCK', 'true') === 'true';
    this.fromNumber = config.get<string>('TWILIO_FROM_NUMBER') ?? '';

    if (!this.mockMode) {
      const sid   = config.get<string>('TWILIO_ACCOUNT_SID');
      const token = config.get<string>('TWILIO_AUTH_TOKEN');
      if (!sid || !token || !this.fromNumber) {
        this.logger.warn('Twilio credentials missing — falling back to mock mode');
        this.mockMode = true;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const twilio = require('twilio');
        this.client = twilio(sid, token);
      }
    }

    if (this.mockMode) {
      this.logger.log('SmsService running in MOCK mode — no real SMS sent');
    }
  }

  /**
   * Send a plain-text SMS. Errors are caught and logged so a bad number
   * never breaks the calling business operation.
   */
  async send(to: string | null | undefined, body: string): Promise<void> {
    if (!to) return;

    if (this.mockMode) {
      this.logger.debug(`[SMS MOCK] To: ${to} | ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`);
      return;
    }

    try {
      await this.client.messages.create({
        from: this.fromNumber,
        to,
        body,
      });
    } catch (err: any) {
      this.logger.error(`SMS send failed to ${to}: ${err.message}`);
    }
  }
}

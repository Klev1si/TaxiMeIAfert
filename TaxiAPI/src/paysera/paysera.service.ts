import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Paysera "pay.lt" integration — redirect-based hosted checkout.
 *
 * Docs: https://developers.paysera.com/en/checkout/integrations/integration-specification
 *
 * Flow:
 *  1. buildPaymentUrl()  → user is redirected to bank.paysera.com/pay/?data=...&sign=...
 *  2. Paysera POSTs the callback URL with form fields { data, ss1 } once paid.
 *  3. parseCallback()    → verifies the MD5 signature and decodes the payment fields.
 *
 * The `data` parameter is a base64url-encoded URL-querystring of the payment
 * fields. The signature is md5(data + signPassword).
 */
@Injectable()
export class PayseraService {
  private readonly logger = new Logger(PayseraService.name);

  /** Numeric project ID issued by Paysera. */
  private readonly projectId: string;

  /** Secret signing password issued by Paysera (NOT the account password). */
  private readonly signPassword: string;

  /** Hosted payment-page endpoint. */
  private readonly payseraUrl =
    'https://bank.paysera.com/pay/';

  /** Paysera spec version (current as of 2026). */
  private readonly version = '1.6';

  constructor(private readonly configService: ConfigService) {
    this.projectId    = this.configService.get<string>('PAYSERA_PROJECT_ID')    ?? '';
    this.signPassword = this.configService.get<string>('PAYSERA_SIGN_PASSWORD') ?? '';
  }

  /** True when Paysera credentials are configured (i.e. real payments can run). */
  isConfigured(): boolean {
    return Boolean(this.projectId && this.signPassword);
  }

  /**
   * Build the redirect URL the client should be sent to.
   *
   * @param params.orderId       Unique merchant order id (we use `sub_<subId>`).
   * @param params.amount        Amount in *minor units* (cents).
   * @param params.currency      ISO-4217 code, e.g. 'EUR'.
   * @param params.acceptUrl     Where to redirect after success.
   * @param params.cancelUrl     Where to redirect if user cancels.
   * @param params.callbackUrl   Server-to-server notification URL.
   * @param params.payerEmail    Optional — pre-fills email on the payment page.
   * @param params.payerName     Optional — pre-fills payer name.
   */
  buildPaymentUrl(params: {
    orderId:     string;
    amount:      number;
    currency:    string;
    acceptUrl:   string;
    cancelUrl:   string;
    callbackUrl: string;
    payerEmail?: string;
    payerName?:  string;
  }): string {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Paysera is not configured (PAYSERA_PROJECT_ID / PAYSERA_SIGN_PASSWORD).',
      );
    }

    const fields: Record<string, string> = {
      projectid:   this.projectId,
      orderid:     params.orderId,
      accepturl:   params.acceptUrl,
      cancelurl:   params.cancelUrl,
      callbackurl: params.callbackUrl,
      version:     this.version,
      amount:      String(Math.round(params.amount)),
      currency:    params.currency.toUpperCase(),
      test:        this.configService.get<string>('PAYSERA_TEST_MODE') === 'true' ? '1' : '0',
    };
    if (params.payerEmail) fields.p_email     = params.payerEmail;
    if (params.payerName)  fields.p_firstname = params.payerName;

    const data = this.encodeData(fields);
    const sign = this.sign(data);

    return `${this.payseraUrl}?data=${encodeURIComponent(data)}&sign=${sign}`;
  }

  /**
   * Verify and parse a Paysera callback body.
   * Returns the decoded fields if the signature is valid; throws otherwise.
   *
   * The caller (controller) MUST respond with the literal text "OK" so that
   * Paysera stops retrying.
   */
  parseCallback(body: { data?: string; ss1?: string }): Record<string, string> {
    if (!body.data || !body.ss1) {
      throw new BadRequestException('Missing Paysera callback fields (data, ss1)');
    }
    const expected = this.sign(body.data);
    if (!this.timingSafeEqual(expected, body.ss1)) {
      this.logger.warn('Paysera callback signature mismatch');
      throw new BadRequestException('Invalid Paysera callback signature');
    }
    return this.decodeData(body.data);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private sign(data: string): string {
    return crypto.createHash('md5').update(data + this.signPassword).digest('hex');
  }

  /** base64-url encode without padding (Paysera convention). */
  private encodeData(fields: Record<string, string>): string {
    const qs = Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return Buffer.from(qs, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private decodeData(data: string): Record<string, string> {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const qs = Buffer.from(padded, 'base64').toString('utf8');
    const out: Record<string, string> = {};
    for (const pair of qs.split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return out;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  }
}

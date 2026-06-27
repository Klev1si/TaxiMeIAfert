import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Ride } from '../entities/index.js';
import { PaymentStatus } from '../common/enums/index.js';

export interface ReceiptData {
  ride: Ride;
  clientName: string;
  clientEmail: string;
  driverName: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly mockMode: boolean;
  private transporter: Transporter | null = null;
  private readonly from: string;
  /** Brevo HTTP API key. When set, takes precedence over SMTP — bypasses
   *  port-blocking on cloud hosts (Railway etc.) by using HTTPS. */
  private readonly brevoApiKey: string | null;

  constructor(private readonly config: ConfigService) {
    this.mockMode    = config.get<string>('SMTP_MOCK', 'true') === 'true';
    this.from        = config.get<string>('SMTP_FROM', 'TaxiApp <noreply@taxiapp.com>');
    this.brevoApiKey = config.get<string>('BREVO_API_KEY') || null;

    if (this.brevoApiKey && !this.mockMode) {
      this.logger.log(
        `MailerService initialised with Brevo HTTP API — from=${this.from}`,
      );
      return; // Skip SMTP setup — HTTP API will be used
    }

    if (!this.mockMode) {
      this.transporter = nodemailer.createTransport({
        host:   config.getOrThrow<string>('SMTP_HOST'),
        port:   config.get<number>('SMTP_PORT', 587),
        secure: config.get<number>('SMTP_PORT', 587) === 465,
        auth: {
          user: config.getOrThrow<string>('SMTP_USER'),
          pass: config.getOrThrow<string>('SMTP_PASS'),
        },
        // Fail fast instead of letting the mobile request hang for 30+ s
        // when SMTP credentials are wrong or the host blocks the IP.
        connectionTimeout: 10_000,
        greetingTimeout:   10_000,
        socketTimeout:     15_000,
      });
      this.logger.log(
        `MailerService initialised with SMTP transport — host=${config.get('SMTP_HOST')} ` +
        `port=${config.get('SMTP_PORT')} user=${config.get('SMTP_USER')?.slice(0, 6)}…`,
      );
    } else {
      this.logger.warn(
        `MailerService running in MOCK mode — emails logged, not sent. ` +
        `(SMTP_MOCK="${config.get('SMTP_MOCK')}" — set this to false to enable real sending.)`,
      );
    }
  }

  /**
   * Send a password-reset 6-digit code to the user.
   * Errors are caught and logged — but in this case we DO rethrow so the
   * caller (PasswordResetService) can surface a "could not send" error to
   * the user, otherwise they'd wait for a code that never arrives.
   */
  async sendPasswordResetCode(toEmail: string, code: string): Promise<void> {
    const subject = `Your TaxiApp password reset code`;
    const html = this.buildResetCodeHtml(code);
    await this.send(toEmail, subject, html);
    this.logger.debug(`Password reset code sent to ${toEmail}`);
  }

  /**
   * Internal: deliver an email via the best available transport.
   *   1. mockMode → log only
   *   2. Brevo HTTP API → POST to api.brevo.com (HTTPS, port 443 — never
   *      blocked by cloud hosts the way SMTP often is)
   *   3. SMTP → nodemailer fallback for self-hosted / non-Brevo setups
   */
  /** Public single-shot send for transactional notifications. */
  async sendPlain(to: string, subject: string, html: string): Promise<void> {
    return this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (this.mockMode) {
      this.logger.debug(`[MAIL MOCK] To: ${to} | Subject: ${subject}`);
      return;
    }

    if (this.brevoApiKey) {
      await this.sendViaBrevoApi(to, subject, html);
      return;
    }

    if (!this.transporter) throw new Error('No mail transport configured (set BREVO_API_KEY or SMTP_*)');
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }

  /**
   * Send via Brevo's HTTPS API. Uses Node's built-in fetch (Node 18+).
   * Body docs: https://developers.brevo.com/reference/sendtransacemail
   */
  private async sendViaBrevoApi(to: string, subject: string, html: string): Promise<void> {
    // Parse `Name <email>` into separate fields if present, else use as-is.
    const fromMatch = this.from.match(/^\s*(.+?)\s*<\s*([^>\s]+)\s*>\s*$/);
    const senderName  = fromMatch ? fromMatch[1].trim() : 'TaxiApp';
    const senderEmail = fromMatch ? fromMatch[2].trim() : this.from.trim();

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'api-key':      this.brevoApiKey!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender:      { name: senderName, email: senderEmail },
        to:          [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Brevo API ${res.status}: ${text.slice(0, 300)}`);
    }
  }

  private buildResetCodeHtml(code: string): string {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#1565C0;padding:24px;text-align:center;color:#fff;">
          <div style="font-size:22px;font-weight:bold;">🚕 TaxiApp</div>
          <div style="color:#90CAF9;font-size:13px;margin-top:4px;">Password Reset</div>
        </td></tr>
        <tr><td style="padding:32px;text-align:center;">
          <p style="margin:0 0 16px;font-size:16px;color:#212121;">
            Use this 6-digit code to reset your password:
          </p>
          <div style="font-size:36px;font-weight:bold;color:#1565C0;letter-spacing:8px;margin:24px 0;">${this.esc(code)}</div>
          <p style="margin:16px 0 0;font-size:13px;color:#9E9E9E;">
            This code expires in 10 minutes.<br/>
            If you didn't request a reset, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  /**
   * Send a ride receipt email to the client.
   * Errors are caught and logged — a failed email must never break the ride flow.
   */
  async sendRideReceipt(data: ReceiptData): Promise<void> {
    if (!data.clientEmail) return;

    const subject = `Your TaxiApp receipt – ${this.formatDate(data.ride.completedAt ?? new Date())}`;
    const html    = this.buildReceiptHtml(data);

    try {
      await this.send(data.clientEmail, subject, html);
      this.logger.debug(`Receipt sent to ${data.clientEmail} for ride ${data.ride.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to send receipt for ride ${data.ride.id}: ${msg}`);
    }
  }

  // ── HTML template ────────────────────────────────────────────────────────────

  private buildReceiptHtml(data: ReceiptData): string {
    const { ride, clientName, driverName } = data;

    const completedAt   = this.formatDate(ride.completedAt ?? new Date());
    const pickup        = ride.pickupAddress  ?? `${ride.pickupLat}, ${ride.pickupLng}`;
    const dropoff       = ride.dropoffAddress ?? (ride.dropoffLat ? `${ride.dropoffLat}, ${ride.dropoffLng}` : '—');
    const distance      = ride.distanceKm     != null ? `${Number(ride.distanceKm).toFixed(2)} km`   : '—';
    const duration      = ride.durationMinutes != null ? `${Math.round(Number(ride.durationMinutes))} min` : '—';
    const baseFare      = ride.baseFare      != null ? `$${Number(ride.baseFare).toFixed(2)}`      : null;
    const distanceFare  = ride.distanceFare  != null ? `$${Number(ride.distanceFare).toFixed(2)}`  : null;
    const timeFare      = ride.timeFare      != null ? `$${Number(ride.timeFare).toFixed(2)}`      : null;
    const discount      = ride.discountAmount != null && Number(ride.discountAmount) > 0
      ? `-$${Number(ride.discountAmount).toFixed(2)}`
      : null;
    const total         = ride.totalFare != null ? `$${Number(ride.totalFare).toFixed(2)}` : '—';
    const paymentStatus = ride.paymentStatus === PaymentStatus.PAID ? '✅ Paid' : '⏳ Pending';

    const fareRows = [
      baseFare     ? this.fmtRow('Base fare',         baseFare)     : '',
      distanceFare ? this.fmtRow(`Distance (${distance})`, distanceFare) : '',
      timeFare     ? this.fmtRow(`Time (${duration})`,     timeFare)     : '',
      ride.promoCode && discount
        ? this.fmtRow(`Promo (${ride.promoCode})`, discount, '#e53935')
        : '',
    ].filter(Boolean).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TaxiApp Receipt</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1565C0;padding:28px 32px;text-align:center;">
              <div style="font-size:24px;font-weight:bold;color:#ffffff;letter-spacing:1px;">🚕 TaxiApp</div>
              <div style="color:#90CAF9;font-size:14px;margin-top:6px;">Ride Receipt</div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0;font-size:16px;color:#212121;">Hi <strong>${this.esc(clientName)}</strong>,</p>
              <p style="margin:8px 0 0;font-size:14px;color:#616161;">
                Thank you for riding with us! Here is your receipt for the trip completed on
                <strong>${completedAt}</strong>.
              </p>
            </td>
          </tr>

          <!-- Trip summary -->
          <tr>
            <td style="padding:24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#F3F6FB;border-radius:6px;padding:16px;">
                <tr>
                  <td style="padding:0 0 12px;">
                    <div style="font-size:11px;text-transform:uppercase;color:#9E9E9E;letter-spacing:.8px;">Pickup</div>
                    <div style="font-size:14px;color:#212121;margin-top:4px;">📍 ${this.esc(pickup)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="border-top:1px solid #E0E0E0;padding:12px 0 0;">
                    <div style="font-size:11px;text-transform:uppercase;color:#9E9E9E;letter-spacing:.8px;">Dropoff</div>
                    <div style="font-size:14px;color:#212121;margin-top:4px;">🏁 ${this.esc(dropoff)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Trip stats -->
          <tr>
            <td style="padding:16px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="text-align:center;background:#F3F6FB;border-radius:6px;padding:12px;">
                    <div style="font-size:11px;text-transform:uppercase;color:#9E9E9E;">Distance</div>
                    <div style="font-size:20px;font-weight:bold;color:#1565C0;margin-top:4px;">${distance}</div>
                  </td>
                  <td width="8"></td>
                  <td width="50%" style="text-align:center;background:#F3F6FB;border-radius:6px;padding:12px;">
                    <div style="font-size:11px;text-transform:uppercase;color:#9E9E9E;">Duration</div>
                    <div style="font-size:20px;font-weight:bold;color:#1565C0;margin-top:4px;">${duration}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fare breakdown -->
          <tr>
            <td style="padding:24px 32px 0;">
              <div style="font-size:13px;font-weight:bold;text-transform:uppercase;color:#9E9E9E;letter-spacing:.8px;margin-bottom:12px;">
                Fare Breakdown
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                ${fareRows}
                <!-- Total -->
                <tr style="border-top:2px solid #E0E0E0;">
                  <td style="padding:12px 0 0;font-size:16px;font-weight:bold;color:#212121;">Total</td>
                  <td style="padding:12px 0 0;font-size:16px;font-weight:bold;color:#1565C0;text-align:right;">${total}</td>
                </tr>
                <!-- Payment status -->
                <tr>
                  <td style="padding:6px 0 0;font-size:13px;color:#616161;">Payment</td>
                  <td style="padding:6px 0 0;font-size:13px;color:#616161;text-align:right;">${paymentStatus}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Driver -->
          <tr>
            <td style="padding:20px 32px 0;">
              <div style="font-size:13px;color:#9E9E9E;">Your driver: <strong style="color:#212121;">${this.esc(driverName)}</strong></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px;text-align:center;border-top:1px solid #EEEEEE;margin-top:24px;">
              <div style="font-size:12px;color:#9E9E9E;">
                Questions? Contact us at <a href="mailto:support@taxiapp.com" style="color:#1565C0;">support@taxiapp.com</a>
              </div>
              <div style="font-size:11px;color:#BDBDBD;margin-top:8px;">
                © ${new Date().getFullYear()} TaxiApp. All rights reserved.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private fmtRow(label: string, value: string, valueColor = '#212121'): string {
    return `<tr>
      <td style="padding:6px 0;font-size:14px;color:#616161;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:${valueColor};text-align:right;">${value}</td>
    </tr>`;
  }

  private formatDate(d: Date): string {
    return d.toLocaleString('en-US', {
      month:  'long',
      day:    'numeric',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  }

  /** Basic HTML entity escaping to prevent XSS in the email template */
  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

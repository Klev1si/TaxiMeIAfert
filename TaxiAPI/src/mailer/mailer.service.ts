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

  constructor(private readonly config: ConfigService) {
    this.mockMode = config.get<string>('SMTP_MOCK', 'true') === 'true';
    this.from     = config.get<string>('SMTP_FROM', 'TaxiApp <noreply@taxiapp.com>');

    if (!this.mockMode) {
      this.transporter = nodemailer.createTransport({
        host:   config.getOrThrow<string>('SMTP_HOST'),
        port:   config.get<number>('SMTP_PORT', 587),
        secure: config.get<number>('SMTP_PORT', 587) === 465,
        auth: {
          user: config.getOrThrow<string>('SMTP_USER'),
          pass: config.getOrThrow<string>('SMTP_PASS'),
        },
      });
      this.logger.log('MailerService initialised with SMTP transport');
    } else {
      this.logger.log('MailerService running in MOCK mode — emails logged, not sent');
    }
  }

  /**
   * Send a ride receipt email to the client.
   * Errors are caught and logged — a failed email must never break the ride flow.
   */
  async sendRideReceipt(data: ReceiptData): Promise<void> {
    if (!data.clientEmail) return;

    const subject = `Your TaxiApp receipt – ${this.formatDate(data.ride.completedAt ?? new Date())}`;
    const html    = this.buildReceiptHtml(data);

    if (this.mockMode) {
      this.logger.debug(`[SMTP MOCK] To: ${data.clientEmail} | Subject: ${subject}`);
      this.logger.debug(`[SMTP MOCK] Fare: $${data.ride.totalFare ?? 'N/A'}`);
      return;
    }

    try {
      await this.transporter!.sendMail({
        from:    this.from,
        to:      data.clientEmail,
        subject,
        html,
      });
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

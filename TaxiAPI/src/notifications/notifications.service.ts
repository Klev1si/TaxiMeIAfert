import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly mockMode: boolean;

  // Lazily-imported firebase-admin (only when not in mock mode)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private adminApp: any;

  constructor(private readonly config: ConfigService) {
    this.mockMode = config.get<string>('FIREBASE_MOCK') === 'true';

    if (!this.mockMode) {
      this.initFirebase();
    } else {
      this.logger.log('NotificationsService running in MOCK mode — no FCM messages sent');
    }
  }

  private initFirebase(): void {
    // Dynamic import so firebase-admin is not loaded in mock/test builds
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin');
    if (admin.apps.length === 0) {
      const serviceAccountPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
      if (serviceAccountPath) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      } else {
        // Fall back to Application Default Credentials (GCP / Cloud Run)
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      }
    }
    this.adminApp = admin;
  }

  /**
   * Send a push notification to a single FCM registration token.
   * Errors are logged but never thrown — a missing FCM token must never break
   * the ride flow.
   */
  async sendToToken(token: string | null | undefined, payload: FcmPayload): Promise<void> {
    if (!token) return;

    if (this.mockMode) {
      this.logger.debug(
        `[FCM MOCK] → ${token.slice(0, 20)}...  |  ${payload.title}: ${payload.body}`,
      );
      if (payload.data) {
        this.logger.debug(`[FCM MOCK] data: ${JSON.stringify(payload.data)}`);
      }
      return;
    }

    try {
      await this.adminApp.messaging().send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        // ── Android: high-priority so the device wakes even when screen-locked ──
        android: {
          priority: 'high',
          notification: {
            channelId:              'taxiapp_rides',
            priority:               'max',
            defaultSound:           true,
            defaultVibrateTimings:  true,
            visibility:             'public', // show full content on lock screen
          },
        },
        // ── iOS: alert + sound, mark as time-sensitive so it bypasses focus modes ──
        apns: {
          headers: { 'apns-priority': '10' },
          payload: {
            aps: {
              alert: { title: payload.title, body: payload.body },
              sound: 'default',
              'interruption-level': 'time-sensitive',
            },
          },
        },
      });
      this.logger.debug(`FCM sent to ${token.slice(0, 20)}...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`FCM send failed (token …${token.slice(-8)}): ${msg}`);
    }
  }
}

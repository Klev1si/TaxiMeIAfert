import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  /**
   * 'high' (default) wakes the device and breaks through iOS Focus — for
   * ride events. 'normal' is for reminders / promos that can wait.
   */
  priority?: 'high' | 'normal';
  /**
   * Drop the push if the device can't be reached within this many seconds
   * (e.g. phone offline). Unset = FCM default (up to 4 weeks). Use for
   * time-bound reminders so a "good morning" push doesn't land at night.
   */
  ttlSeconds?: number;
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
      const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
      if (raw) {
        // Accept EITHER a JSON string (recommended on Railway/Heroku — you
        // paste the full service-account JSON as one env var) OR a file path
        // (for local dev where the JSON sits on disk).
        let serviceAccount: object;
        const trimmed = raw.trim();
        if (trimmed.startsWith('{')) {
          try {
            serviceAccount = JSON.parse(trimmed);
          } catch (err) {
            this.logger.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON', err);
            return;
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          serviceAccount = require(raw);
        }
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        this.logger.log('Firebase Admin initialized — push notifications enabled');
      } else {
        // Fall back to Application Default Credentials (GCP / Cloud Run)
        try {
          admin.initializeApp({ credential: admin.credential.applicationDefault() });
          this.logger.log('Firebase Admin initialized with default credentials');
        } catch (err) {
          this.logger.error(
            'Firebase Admin failed to initialize. Set FIREBASE_SERVICE_ACCOUNT to the JSON content of your service-account key, or set FIREBASE_MOCK=true.',
            err,
          );
        }
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

    const urgent = payload.priority !== 'normal';
    const ttl = payload.ttlSeconds;

    try {
      await this.adminApp.messaging().send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        // ── Android: high-priority so the device wakes even when screen-locked ──
        android: {
          ...(ttl != null ? { ttl: ttl * 1000 } : {}),
          priority: urgent ? 'high' : 'normal',
          notification: {
            channelId:              'taxiapp_rides',
            priority:               urgent ? 'max' : 'default',
            defaultSound:           true,
            defaultVibrateTimings:  true,
            visibility:             'public', // show full content on lock screen
          },
        },
        // ── iOS: alert + sound, mark as time-sensitive so it bypasses focus modes ──
        apns: {
          headers: {
            'apns-priority': urgent ? '10' : '5',
            ...(ttl != null
              ? { 'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl) }
              : {}),
          },
          payload: {
            aps: {
              alert: { title: payload.title, body: payload.body },
              sound: 'default',
              'interruption-level': urgent ? 'time-sensitive' : 'active',
            },
          },
        },
      });
      this.logger.debug(`FCM sent to ${token.slice(0, 20)}...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      this.logger.warn(`FCM send failed (token …${token.slice(-8)}) [${code ?? 'no-code'}]: ${msg}`);
    }
  }
}

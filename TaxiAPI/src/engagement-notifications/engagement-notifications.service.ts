import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { EngagementNotification, EngagementNotificationType as T } from '../entities/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { ENGAGEMENT_MESSAGES, EngagementMessage } from './engagement-messages.js';

/** Local time zone all engagement crons run in (Kosovo / Albania = CET/CEST). */
const TZ = process.env.ENGAGEMENT_TZ || 'Europe/Tirane';

/** Max automatic engagement pushes a single user gets per local day. */
const DAILY_CAP = 2;

/** Pushes sent concurrently per batch — keeps FCM + DB load flat. */
const SEND_CONCURRENCY = 50;

const HOUR = 1;
const DAY  = 24 * HOUR;

/**
 * How long FCM keeps an undelivered push (phone offline) before dropping it.
 * Time-of-day reminders expire quickly so they never arrive hours late.
 */
const TTL_SECONDS: Record<T, number> = {
  [T.DRIVER_MORNING]:      3 * 3600,
  [T.DRIVER_EVENING_PEAK]: 3 * 3600,
  [T.COMPANY_MORNING]:     3 * 3600,
  [T.CLIENT_WEEKEND]:      6 * 3600,
  [T.DRIVER_WINBACK]:      12 * 3600,
  [T.DRIVER_WEEKLY]:       12 * 3600,
  [T.COMPANY_NO_DRIVERS]:  12 * 3600,
  [T.COMPANY_WEEKLY]:      12 * 3600,
  [T.CLIENT_FIRST_RIDE]:   12 * 3600,
  [T.CLIENT_WINBACK]:      12 * 3600,
};

interface Candidate {
  userId:   string;
  fcmToken: string;
  /** First name for people, company name for companies. */
  name:     string | null;
  /** Extra template values ({rides}, {amount}, {online}, {total}). */
  vars?:    Record<string, string | number>;
  /** Per-candidate override of the campaign's minimum interval. */
  minIntervalHours?: number;
}

interface CampaignRules {
  /** Don't resend this campaign to a user sooner than this. */
  minIntervalHours: number;
  /** Stop after this many sends of this campaign to a user, ever. */
  maxTotal?: number;
}

interface LedgerStats {
  user_id:       string;
  today_count:   number;
  last_of_type:  Date | null;
  last_key:      string | null;
  total_of_type: number;
}

/** "Now, in local time" truncated to the start of today, as a timestamptz. */
const LOCAL_TODAY_START = `(date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)`;
/** Monday 00:00 local of the current week, as a timestamptz. */
const LOCAL_WEEK_START  = `(date_trunc('week', now() AT TIME ZONE $1) AT TIME ZONE $1)`;

/** Shared WHERE fragment: user can receive engagement pushes at all. */
const REACHABLE_USER = `
  u.is_active = TRUE
  AND u.fcm_token IS NOT NULL
  AND u.engagement_notifications_enabled = TRUE
`;

/**
 * Automatic engagement notifications — "time to go online" reminders for
 * drivers, fleet status for companies, and first-ride / win-back / weekend
 * nudges for clients.
 *
 * Every campaign goes through deliver(), which enforces:
 *  - the user's opt-out flag and a daily cap of DAILY_CAP pushes,
 *  - a per-campaign minimum interval (and optional lifetime max),
 *  - message rotation: never the same text twice in a row,
 *  - a Redis lock so multiple API replicas don't double-send.
 *
 * Disable everything with ENGAGEMENT_NOTIFICATIONS_ENABLED=false.
 */
@Injectable()
export class EngagementNotificationsService {
  private readonly logger = new Logger(EngagementNotificationsService.name);

  constructor(
    @InjectRepository(EngagementNotification)
    private readonly ledger: Repository<EngagementNotification>,
    private readonly notifications: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Drivers ────────────────────────────────────────────────────────────────

  /** 09:00 daily — offline drivers who were active in the last 3 days. */
  @Cron('0 9 * * *', { timeZone: TZ })
  async driverMorning(): Promise<void> {
    await this.runCampaign(T.DRIVER_MORNING, { minIntervalHours: 20 * HOUR }, () =>
      this.query(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", d.first_name AS name
        FROM drivers d JOIN users u ON u.id = d.user_id
        WHERE ${REACHABLE_USER}
          AND d.is_approved = TRUE
          AND d.is_online = FALSE
          AND GREATEST(COALESCE(u.last_active_at, u.created_at),
                       COALESCE(d.last_location_at, u.created_at)) >= now() - interval '3 days'
      `),
    );
  }

  /** 17:00 Mon–Fri — offline drivers who haven't been online at all today. */
  @Cron('0 17 * * 1-5', { timeZone: TZ })
  async driverEveningPeak(): Promise<void> {
    await this.runCampaign(T.DRIVER_EVENING_PEAK, { minIntervalHours: 20 * HOUR }, () =>
      this.query(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", d.first_name AS name
        FROM drivers d JOIN users u ON u.id = d.user_id
        WHERE ${REACHABLE_USER}
          AND d.is_approved = TRUE
          AND d.is_online = FALSE
          AND COALESCE(d.last_location_at, 'epoch') < ${LOCAL_TODAY_START}
          AND GREATEST(COALESCE(u.last_active_at, u.created_at),
                       COALESCE(d.last_location_at, u.created_at)) >= now() - interval '3 days'
      `, [TZ]),
    );
  }

  /**
   * 12:00 daily — drivers inactive for 3+ days. Every 3 days for the first
   * two weeks, then weekly, and we give up after 60 days of silence.
   */
  @Cron('0 12 * * *', { timeZone: TZ })
  async driverWinback(): Promise<void> {
    await this.runCampaign(T.DRIVER_WINBACK, { minIntervalHours: 3 * DAY - 4 * HOUR }, async () => {
      const rows = await this.query<Candidate & { inactiveDays: number }>(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", d.first_name AS name,
               EXTRACT(DAY FROM now() - GREATEST(COALESCE(u.last_active_at, u.created_at),
                                                 COALESCE(d.last_location_at, u.created_at)))::int
                 AS "inactiveDays"
        FROM drivers d JOIN users u ON u.id = d.user_id
        WHERE ${REACHABLE_USER}
          AND d.is_approved = TRUE
          AND d.is_online = FALSE
          AND GREATEST(COALESCE(u.last_active_at, u.created_at),
                       COALESCE(d.last_location_at, u.created_at))
              BETWEEN now() - interval '60 days' AND now() - interval '3 days'
      `);
      return rows.map((r) => ({
        ...r,
        minIntervalHours: r.inactiveDays >= 14 ? 7 * DAY - 4 * HOUR : undefined,
      }));
    });
  }

  /** Monday 10:00 — last week's ride count + turnover, for drivers who drove. */
  @Cron('0 10 * * 1', { timeZone: TZ })
  async driverWeekly(): Promise<void> {
    await this.runCampaign(T.DRIVER_WEEKLY, { minIntervalHours: 6 * DAY }, async () => {
      const rows = await this.query<Candidate & { rides: number; amount: string }>(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", d.first_name AS name,
               COUNT(r.id)::int AS rides, COALESCE(SUM(r.total_fare), 0) AS amount
        FROM rides r
        JOIN drivers d ON d.id = r.driver_id
        JOIN users u   ON u.id = d.user_id
        WHERE ${REACHABLE_USER}
          AND r.status = 'completed'
          AND r.completed_at >= ${LOCAL_WEEK_START} - interval '7 days'
          AND r.completed_at <  ${LOCAL_WEEK_START}
        GROUP BY u.id, u.fcm_token, d.first_name
      `, [TZ]);
      return rows.map((r) => ({
        ...r,
        vars: { rides: r.rides, amount: formatAmount(r.amount) },
      }));
    });
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  /** 09:30 daily — "X of Y drivers online", only when some are still offline. */
  @Cron('30 9 * * *', { timeZone: TZ })
  async companyMorning(): Promise<void> {
    await this.runCampaign(T.COMPANY_MORNING, { minIntervalHours: 20 * HOUR }, async () => {
      const rows = await this.query<Candidate & { online: number; total: number }>(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", c.name AS name,
               COUNT(d.id) FILTER (WHERE d.is_online)::int AS online,
               COUNT(d.id)::int AS total
        FROM companies c
        JOIN users u   ON u.id = c.user_id
        JOIN drivers d ON d.company_id = c.id AND d.is_approved = TRUE
        WHERE ${REACHABLE_USER}
          AND c.is_approved = TRUE
        GROUP BY u.id, u.fcm_token, c.name
      `);
      return rows
        .filter((r) => r.online < r.total)
        .map((r) => ({ ...r, vars: { online: r.online, total: r.total } }));
    });
  }

  /** Wednesday 11:00 — approved companies that still have no drivers (max 6 times). */
  @Cron('0 11 * * 3', { timeZone: TZ })
  async companyNoDrivers(): Promise<void> {
    await this.runCampaign(T.COMPANY_NO_DRIVERS, { minIntervalHours: 6 * DAY, maxTotal: 6 }, () =>
      this.query(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", c.name AS name
        FROM companies c JOIN users u ON u.id = c.user_id
        WHERE ${REACHABLE_USER}
          AND c.is_approved = TRUE
          AND u.created_at <= now() - interval '2 days'
          AND NOT EXISTS (SELECT 1 FROM drivers d WHERE d.company_id = c.id)
      `),
    );
  }

  /** Monday 10:00 — last week's fleet ride count + turnover. */
  @Cron('0 10 * * 1', { timeZone: TZ })
  async companyWeekly(): Promise<void> {
    await this.runCampaign(T.COMPANY_WEEKLY, { minIntervalHours: 6 * DAY }, async () => {
      const rows = await this.query<Candidate & { rides: number; amount: string }>(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", c.name AS name,
               COUNT(r.id)::int AS rides, COALESCE(SUM(r.total_fare), 0) AS amount
        FROM rides r
        JOIN companies c ON c.id = r.company_id
        JOIN users u     ON u.id = c.user_id
        WHERE ${REACHABLE_USER}
          AND r.status = 'completed'
          AND r.completed_at >= ${LOCAL_WEEK_START} - interval '7 days'
          AND r.completed_at <  ${LOCAL_WEEK_START}
        GROUP BY u.id, u.fcm_token, c.name
      `, [TZ]);
      return rows.map((r) => ({
        ...r,
        vars: { rides: r.rides, amount: formatAmount(r.amount) },
      }));
    });
  }

  // ── Clients ────────────────────────────────────────────────────────────────

  /** 11:00 daily — signed up 1–30 days ago, never rode. Every 3 days, max 4 times. */
  @Cron('0 11 * * *', { timeZone: TZ })
  async clientFirstRide(): Promise<void> {
    await this.runCampaign(
      T.CLIENT_FIRST_RIDE,
      { minIntervalHours: 3 * DAY - 4 * HOUR, maxTotal: 4 },
      () =>
        this.query(`
          SELECT u.id AS "userId", u.fcm_token AS "fcmToken", cl.first_name AS name
          FROM clients cl JOIN users u ON u.id = cl.user_id
          WHERE ${REACHABLE_USER}
            AND cl.total_rides = 0
            AND u.created_at BETWEEN now() - interval '30 days' AND now() - interval '1 day'
        `),
    );
  }

  /** 16:00 daily — clients whose last ride was 14–120 days ago. Every 14 days. */
  @Cron('0 16 * * *', { timeZone: TZ })
  async clientWinback(): Promise<void> {
    await this.runCampaign(T.CLIENT_WINBACK, { minIntervalHours: 14 * DAY - 4 * HOUR }, () =>
      this.query(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", cl.first_name AS name
        FROM clients cl
        JOIN users u ON u.id = cl.user_id
        JOIN LATERAL (
          SELECT MAX(r.completed_at) AS last_ride FROM rides r
          WHERE r.client_id = cl.id AND r.status = 'completed'
        ) lr ON TRUE
        WHERE ${REACHABLE_USER}
          AND cl.total_rides > 0
          AND lr.last_ride BETWEEN now() - interval '120 days' AND now() - interval '14 days'
          AND COALESCE(u.last_active_at, u.created_at) < now() - interval '3 days'
      `),
    );
  }

  /** Friday 17:00 — clients who used the app in the last 60 days. */
  @Cron('0 17 * * 5', { timeZone: TZ })
  async clientWeekend(): Promise<void> {
    await this.runCampaign(T.CLIENT_WEEKEND, { minIntervalHours: 6 * DAY }, () =>
      this.query(`
        SELECT u.id AS "userId", u.fcm_token AS "fcmToken", cl.first_name AS name
        FROM clients cl JOIN users u ON u.id = cl.user_id
        WHERE ${REACHABLE_USER}
          AND COALESCE(u.last_active_at, u.created_at) >= now() - interval '60 days'
      `),
    );
  }

  // ── Engine ─────────────────────────────────────────────────────────────────

  private async runCampaign(
    type: T,
    rules: CampaignRules,
    loadCandidates: () => Promise<Candidate[]>,
  ): Promise<void> {
    if (process.env.ENGAGEMENT_NOTIFICATIONS_ENABLED === 'false') return;
    if (!(await this.acquireLock(type))) {
      this.logger.debug(`${type}: another instance holds the lock — skipping`);
      return;
    }

    try {
      const candidates = await loadCandidates();
      const sent = await this.deliver(type, rules, candidates);
      this.logger.log(`${type}: sent ${sent} of ${candidates.length} candidates`);
    } catch (err: any) {
      this.logger.error(`${type} failed: ${err.message}`, err.stack);
    }
  }

  /** Filter candidates by cap / interval, send, and record in the ledger. */
  private async deliver(type: T, rules: CampaignRules, candidates: Candidate[]): Promise<number> {
    if (candidates.length === 0) return 0;

    const stats = await this.loadStats(type, candidates.map((c) => c.userId));
    const now = Date.now();

    const eligible = candidates.filter((c) => {
      const s = stats.get(c.userId);
      if (!s) return true;
      if (s.today_count >= DAILY_CAP) return false;
      if (rules.maxTotal != null && s.total_of_type >= rules.maxTotal) return false;
      const interval = c.minIntervalHours ?? rules.minIntervalHours;
      if (s.last_of_type && now - new Date(s.last_of_type).getTime() < interval * 3_600_000) {
        return false;
      }
      return true;
    });

    let sent = 0;
    for (let i = 0; i < eligible.length; i += SEND_CONCURRENCY) {
      const batch = eligible.slice(i, i + SEND_CONCURRENCY);
      const rows = await Promise.all(
        batch.map(async (c) => {
          const msg = pickMessage(type, stats.get(c.userId)?.last_key ?? null);
          await this.notifications.sendToToken(c.fcmToken, {
            title:    render(msg.title, c),
            body:     render(msg.body, c),
            data:     { event: 'engagement', type },
            priority: 'normal',
            ttlSeconds: TTL_SECONDS[type],
          });
          return this.ledger.create({ userId: c.userId, type, messageKey: msg.key });
        }),
      );
      await this.ledger.save(rows);
      sent += rows.length;
    }
    return sent;
  }

  private async loadStats(type: T, userIds: string[]): Promise<Map<string, LedgerStats>> {
    const rows: LedgerStats[] = await this.ledger.query(
      `
      SELECT user_id,
             COUNT(*) FILTER (WHERE sent_at >= ${LOCAL_TODAY_START})::int AS today_count,
             MAX(sent_at) FILTER (WHERE type = $2)                        AS last_of_type,
             (ARRAY_AGG(message_key ORDER BY sent_at DESC)
                FILTER (WHERE type = $2))[1]                             AS last_key,
             COUNT(*) FILTER (WHERE type = $2)::int                       AS total_of_type
      FROM engagement_notifications
      WHERE user_id = ANY($3::uuid[])
      GROUP BY user_id
      `,
      [TZ, type, userIds],
    );
    return new Map(rows.map((r) => [r.user_id, r]));
  }

  /**
   * One run per campaign per local day across all replicas. If Redis is down
   * we still run — the ledger's interval check prevents double sends on a
   * single instance, which is the common deployment.
   */
  private async acquireLock(type: T): Promise<boolean> {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    try {
      const ok = await this.redis.set(`engagement:lock:${type}:${day}`, '1', 'EX', 6 * 3600, 'NX');
      return ok === 'OK';
    } catch (err: any) {
      this.logger.warn(`Redis lock unavailable for ${type} (${err.message}) — running anyway`);
      return true;
    }
  }

  private query<R = Candidate>(sql: string, params: unknown[] = []): Promise<R[]> {
    return this.ledger.query(sql, params);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Random variant, avoiding the one the user received last time. */
export function pickMessage(type: T, lastKey: string | null): EngagementMessage {
  const pool = ENGAGEMENT_MESSAGES[type];
  const options = pool.length > 1 ? pool.filter((m) => m.key !== lastKey) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

/** Fill {placeholders}; a missing name drops the ", {name}" cleanly. */
export function render(template: string, c: Pick<Candidate, 'name' | 'vars'>): string {
  const name = c.name?.trim();
  let out = name
    ? template.replace(/\{name\}/g, name)
    : template.replace(/,?\s*\{name\}/g, '');
  for (const [k, v] of Object.entries(c.vars ?? {})) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
}

function formatAmount(raw: string | number): string {
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '0';
}

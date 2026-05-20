import { Controller, Get, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

interface HealthStatus {
  status:   'ok' | 'degraded';
  uptime:   number;
  memory:   { heapUsedMb: number; heapTotalMb: number; rssMb: number };
  db:       { status: 'ok' | 'error'; latencyMs?: number; error?: string };
  redis:    { status: 'ok' | 'error'; latencyMs?: number; error?: string };
  version:  string;
  checkedAt: string;
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const [db, redis] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const mem  = process.memoryUsage();
    const mb   = (b: number) => Math.round(b / 1024 / 1024);
    const ok   = db.status === 'ok' && redis.status === 'ok';

    return {
      status:    ok ? 'ok' : 'degraded',
      uptime:    Math.floor(process.uptime()),
      memory:    { heapUsedMb: mb(mem.heapUsed), heapTotalMb: mb(mem.heapTotal), rssMb: mb(mem.rss) },
      db,
      redis,
      version:   process.env.npm_package_version ?? '0.0.1',
      checkedAt: new Date().toISOString(),
    };
  }

  // ── Probes ─────────────────────────────────────────────────────────────────

  private async checkDb(): Promise<HealthStatus['db']> {
    const t0 = Date.now();
    try {
      await this.ds.query('SELECT 1');
      return { status: 'ok', latencyMs: Date.now() - t0 };
    } catch (err: any) {
      return { status: 'error', error: err?.message ?? 'unknown' };
    }
  }

  private async checkRedis(): Promise<HealthStatus['redis']> {
    const t0 = Date.now();
    try {
      await this.redis.ping();
      return { status: 'ok', latencyMs: Date.now() - t0 };
    } catch (err: any) {
      return { status: 'error', error: err?.message ?? 'unknown' };
    }
  }
}

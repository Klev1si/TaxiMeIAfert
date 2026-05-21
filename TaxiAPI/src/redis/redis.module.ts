import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        // Prefer full URL (REDIS_PRIVATE_URL / REDIS_URL) which embeds the
        // password. Fall back to individual host/port/password vars — Railway
        // injects all of these from the Redis plugin.
        const redisUrl =
          config.get<string>('REDIS_PRIVATE_URL') ||
          config.get<string>('REDIS_URL');

        const host     = config.get<string>('REDIS_HOST', 'localhost');
        const port     = config.get<number>('REDIS_PORT', 6379);
        const password = config.get<string>('REDIS_PASSWORD') || undefined;

        console.log(
          `[Redis] connecting via ${redisUrl ? 'URL' : `${host}:${port}`}` +
          (password ? ' (password set)' : ' (no password)'),
        );

        const client = redisUrl
          ? new Redis(redisUrl, { lazyConnect: true })
          : new Redis({ host, port, password, lazyConnect: true });

        client.on('error', (err) => {
          console.error('[Redis] Connection error:', err.message);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

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
        // Railway Redis plugin injects REDIS_URL (public) or REDIS_PRIVATE_URL
        // (internal network — preferred in production). The URL already embeds
        // the password, so we don't need to handle auth separately.
        const redisUrl =
          config.get<string>('REDIS_PRIVATE_URL') ||
          config.get<string>('REDIS_URL');

        const client = redisUrl
          ? new Redis(redisUrl, { lazyConnect: true })
          : new Redis({
              host: config.get<string>('REDIS_HOST', 'localhost'),
              port: config.get<number>('REDIS_PORT', 6379),
              password: config.get<string>('REDIS_PASSWORD') || undefined,
              lazyConnect: true,
            });

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

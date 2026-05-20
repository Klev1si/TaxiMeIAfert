import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';
import helmet from 'helmet';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // rawBody: true is required for Stripe webhook signature verification.
    rawBody: true,
  });

  // ── Security headers (Helmet) ─────────────────────────────────────────────
  // Applies a suite of HTTP security headers:
  //   X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security,
  //   X-XSS-Protection, Content-Security-Policy, etc.
  // contentSecurityPolicy is relaxed slightly for the REST API (no HTML served).
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false, // not needed for an API
    }),
  );

  // ── CORS ─────────────────────────────────────────────────────────────────
  // CORS_ORIGIN may be a comma-separated list for multiple front-ends:
  //   CORS_ORIGIN=https://dashboard.taxiapp.com,https://app.taxiapp.com
  const rawOrigins = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  const allowedOrigins = rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server, curl in dev)
      if (!origin) { callback(null, true); return; }

      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' is not permitted`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Raw-Body'],
    exposedHeaders: ['X-Request-Id'],
  });

  // ── Static assets ─────────────────────────────────────────────────────────
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // ── Global exception filter ───────────────────────────────────────────────
  // Ensures consistent error envelopes and hides stack traces in production.
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Global validation pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,  // strip unknown fields
      forbidNonWhitelisted: true,  // 400 on unknown fields
      transform:            true,  // auto-cast query params / body
    }),
  );

  // ── Socket.io adapter ─────────────────────────────────────────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  // ── Database schema sync ──────────────────────────────────────────────────
  // Run dataSource.synchronize() unconditionally on every startup so that all
  // TypeORM entities are reflected in the database schema.  This is safe for
  // development and initial production bring-up; remove / gate behind an env
  // var once the schema is stable and migrations are in place.
  try {
    const dataSource = app.get(DataSource);
    logger.log('Running dataSource.synchronize() to ensure schema is up to date…');
    await dataSource.synchronize();
    logger.log('dataSource.synchronize() completed — all tables are up to date');
  } catch (err) {
    logger.error('dataSource.synchronize() FAILED:', err);
    // Don't crash the server — the error is logged above for diagnosis.
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const env = process.env.NODE_ENV ?? 'development';
  logger.log(`TaxiAPI [${env}] listening on port ${port}`);
  logger.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
}

bootstrap();

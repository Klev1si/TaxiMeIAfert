import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Assigns a unique X-Request-Id to every incoming request and logs:
 *   → [method] [path] [status] [ms]ms  correlationId=[id]
 *
 * The correlation ID is echoed back in the response header so clients
 * can include it in bug reports.
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = (req.headers['x-request-id'] as string) ?? randomUUID();
    req.headers['x-request-id'] = correlationId;
    res.setHeader('X-Request-Id', correlationId);

    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const ms     = Date.now() - start;
      const status = res.statusCode;
      const level  = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';

      this.logger[level](
        `${method} ${originalUrl} ${status} ${ms}ms  rid=${correlationId}`,
      );
    });

    next();
  }
}

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global exception filter — catches every thrown exception and returns a
 * consistent JSON envelope.  In production, internal error details and stack
 * traces are never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    // WebSocket / non-HTTP contexts — do nothing (let the gateway handle it)
    if (host.getType() !== 'http') return;

    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status  = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        // e.g. throw new BadRequestException('some text')
        message = body;
      } else {
        // NestJS wraps the detail inside body.message.
        // We surface that directly so clients receive a flat { message } field
        // instead of { message: { statusCode, message, error } }.
        const bodyObj = body as Record<string, unknown>;
        message = bodyObj.message ?? bodyObj;
      }
    } else {
      // Unexpected / non-HTTP error — log full detail server-side only
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`Unhandled exception on ${req.method} ${req.url}: ${err.message}`, err.stack);
      message = this.isProd ? 'Internal server error' : err.message;
    }

    const correlationId = req.headers['x-request-id'] as string | undefined;

    res.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path:      req.url,
      ...(correlationId      ? { requestId: correlationId }                         : {}),
      // Stack trace only in development — NEVER in production
      ...(!this.isProd && exception instanceof Error ? { stack: exception.stack } : {}),
    });
  }
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Where a request came from — recorded on logins and ride requests so an
 * admin can later tell which device / network acted on an account
 * (e.g. Apple App Review in Cupertino vs. the owner in Kosovo).
 *
 * Forensic only: X-Forwarded-For is client-controlled, so it is stored next
 * to the socket address rather than trusted on its own.
 */
export interface RequestMeta {
  /** Socket peer address as Express sees it. */
  ip: string | null;
  /** Raw X-Forwarded-For header (set by Railway / any reverse proxy). */
  forwardedFor: string | null;
  userAgent: string | null;
  /** X-Client-Platform sent by the mobile app, e.g. "ios 18.1". */
  clientPlatform: string | null;
}

function header(req: any, name: string, max: number): string | null {
  const v = req.headers?.[name];
  const s = Array.isArray(v) ? v.join(', ') : v;
  return typeof s === 'string' && s.length > 0 ? s.slice(0, max) : null;
}

export function extractRequestMeta(req: any): RequestMeta {
  return {
    ip:             (req.ip ?? req.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null,
    forwardedFor:   header(req, 'x-forwarded-for', 255),
    userAgent:      header(req, 'user-agent', 300),
    clientPlatform: header(req, 'x-client-platform', 60),
  };
}

/** The best guess at the caller's public IP: first X-Forwarded-For hop, else the socket. */
export function publicIp(meta: RequestMeta): string | null {
  const first = meta.forwardedFor?.split(',')[0]?.trim();
  return first || meta.ip;
}

export const ReqMeta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestMeta =>
    extractRequestMeta(ctx.switchToHttp().getRequest()),
);

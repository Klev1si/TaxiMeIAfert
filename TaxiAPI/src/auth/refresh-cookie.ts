/**
 * Refresh-token cookie for the web dashboard.
 *
 * Browsers must not keep the long-lived refresh token anywhere JavaScript can
 * read it (localStorage is readable by any script that runs on the page, so a
 * single XSS or malicious dependency could steal a 30-day admin session).
 *
 * When a request carries `X-Client: web-dashboard`, the API instead:
 *   - puts the refresh token in an httpOnly cookie scoped to /auth, and
 *   - leaves it out of the JSON body (the access token, valid 15 min, is
 *     still returned and kept only in memory by the dashboard).
 * On /auth/refresh the token is read back from that cookie.
 *
 * CSRF: the cookie is only honoured together with the custom X-Client header.
 * A custom header forces a CORS preflight, which the CORS allow-list rejects
 * for any origin other than the dashboard.
 *
 * The mobile apps don't send the header and keep using the Authorization
 * header and JSON body exactly as before.
 */
import type { Request, Response } from 'express';
import type { AuthTokensDto } from './dto/auth-tokens.dto';

export const REFRESH_COOKIE     = 'taxi_rt';
export const WEB_CLIENT_HEADER  = 'x-client';
export const WEB_CLIENT_VALUE   = 'web-dashboard';

const COOKIE_PATH   = '/auth';
const COOKIE_MAX_MS = 30 * 24 * 60 * 60 * 1000; // matches the refresh-token TTL

/** SameSite policy. "none" works while the dashboard and API are on different
 *  sites (dashboard.taximeiafert.com ↔ *.up.railway.app). Once the API is
 *  served from api.taximeiafert.com, set REFRESH_COOKIE_SAMESITE=lax. */
function sameSite(): 'none' | 'lax' | 'strict' {
  const v = (process.env.REFRESH_COOKIE_SAMESITE ?? 'none').toLowerCase();
  return v === 'lax' || v === 'strict' ? v : 'none';
}

function cookieOptions() {
  return {
    httpOnly: true,
    // SameSite=None requires Secure. Browsers treat http://localhost as secure,
    // so this also works in local development.
    secure:   process.env.REFRESH_COOKIE_SECURE !== 'false',
    sameSite: sameSite(),
    path:     COOKIE_PATH,
  } as const;
}

export function isWebClient(req: Request): boolean {
  return req.headers[WEB_CLIENT_HEADER] === WEB_CLIENT_VALUE;
}

/** Read the refresh token from the cookie — only for dashboard requests. */
export function readRefreshCookie(req: Request): string | null {
  if (!isWebClient(req)) return null;
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === REFRESH_COOKIE) {
      const value = decodeURIComponent(part.slice(eq + 1).trim());
      return value || null;
    }
  }
  return null;
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

/**
 * Return tokens in the right shape for the caller: unchanged for the mobile
 * apps; for the dashboard the refresh token goes into the cookie and is
 * removed from the body.
 */
export function deliverTokens(req: Request, res: Response, tokens: AuthTokensDto): AuthTokensDto {
  if (!isWebClient(req)) return tokens;
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieOptions(), maxAge: COOKIE_MAX_MS });
  const { refreshToken: _omit, ...rest } = tokens;
  return rest as AuthTokensDto;
}

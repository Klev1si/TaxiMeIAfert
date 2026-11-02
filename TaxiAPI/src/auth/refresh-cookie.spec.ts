import express from 'express';
import request from 'supertest';
import { deliverTokens, readRefreshCookie, clearRefreshCookie } from './refresh-cookie';

const tokens = { accessToken: 'acc', refreshToken: 'ref.token.value', expiresIn: 900 };

function app() {
  const a = express();
  a.post('/auth/login', (req, res) => { res.json(deliverTokens(req, res, tokens)); });
  a.post('/auth/refresh', (req, res) => { res.json({ token: readRefreshCookie(req) }); });
  a.post('/auth/logout', (_req, res) => { clearRefreshCookie(res); res.status(204).end(); });
  return a;
}

describe('refresh cookie (web dashboard)', () => {
  it('mobile clients keep receiving the refresh token in the body, no cookie', async () => {
    const r = await request(app()).post('/auth/login');
    expect(r.body).toEqual(tokens);
    expect(r.headers['set-cookie']).toBeUndefined();
  });

  it('dashboard gets an httpOnly Secure cookie and no refresh token in the body', async () => {
    const r = await request(app()).post('/auth/login').set('X-Client', 'web-dashboard');
    expect(r.body).toEqual({ accessToken: 'acc', expiresIn: 900 });
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^taxi_rt=ref\.token\.value;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=None/);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/Max-Age=2592000/);
  });

  it('reads the cookie only together with the X-Client header (CSRF guard)', async () => {
    const withHeader = await request(app()).post('/auth/refresh')
      .set('X-Client', 'web-dashboard').set('Cookie', 'other=1; taxi_rt=abc');
    expect(withHeader.body.token).toBe('abc');
    const without = await request(app()).post('/auth/refresh').set('Cookie', 'taxi_rt=abc');
    expect(without.body.token).toBeNull();
  });

  it('logout expires the cookie', async () => {
    const r = await request(app()).post('/auth/logout');
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^taxi_rt=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

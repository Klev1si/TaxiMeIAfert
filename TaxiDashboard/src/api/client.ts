import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
} from 'axios';
import config from '../config';

/**
 * Token handling (security):
 *  - The refresh token lives ONLY in an httpOnly cookie set by the API. No
 *    script on this page can read it, so an XSS bug or a malicious npm
 *    package can't steal a long-lived admin session.
 *  - The access token (valid 15 min) is kept in memory only — never in
 *    localStorage/sessionStorage. A page reload gets a fresh one from
 *    /auth/refresh using the cookie.
 *  - Every request sends `X-Client: web-dashboard` so the API uses the cookie
 *    flow (and the custom header blocks cross-site request forgery).
 */
export const WEB_CLIENT_HEADERS = { 'X-Client': 'web-dashboard' } as const;

// Old builds kept both tokens in localStorage. Wipe them on load so a stolen
// copy can't linger in the browser.
try {
  localStorage.removeItem('taxi_access_token');
  localStorage.removeItem('taxi_refresh_token');
} catch { /* storage unavailable — nothing to clean */ }

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ── Axios instance ────────────────────────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,           // send/receive the refresh-token cookie
  headers: { 'Content-Type': 'application/json', ...WEB_CLIENT_HEADERS },
});

/**
 * Exchange the refresh cookie for a new access token. Concurrent callers share
 * one request. Retries once after a short pause: when two tabs refresh at the
 * same moment, one of them rotates the cookie first and the other must retry
 * with the new cookie.
 */
let refreshInFlight: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    const attempt = () =>
      axios.post<{ accessToken: string }>(
        `${config.API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true, headers: WEB_CLIENT_HEADERS, timeout: 15_000 },
      );
    refreshInFlight = attempt()
      .catch(async (err: AxiosError) => {
        if (err.response?.status !== 401) throw err;
        await new Promise((r) => setTimeout(r, 800));
        return attempt();
      })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// ── Request interceptor — attach access token ─────────────────────────────────
apiClient.interceptors.request.use(
  (req: InternalAxiosRequestConfig) => {
    if (accessToken) req.headers.Authorization = `Bearer ${accessToken}`;
    return req;
  },
  (err) => Promise.reject(err),
);

// ── Response interceptor — refresh on 401 ────────────────────────────────────
apiClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url ?? '';

    // Don't try to refresh for the auth endpoints themselves.
    if (
      !original ||
      error.response?.status !== 401 ||
      original._retry ||
      url.includes('/auth/login') ||
      url.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return apiClient(original);
    } catch (refreshErr) {
      setAccessToken(null);
      if (window.location.pathname !== '/login') window.location.href = '/login';
      return Promise.reject(refreshErr);
    }
  },
);

export default apiClient;

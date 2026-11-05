import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import { Platform } from 'react-native';
import Config from '../config';
import { notifyNetworkError } from '../services/connectivity';
import { tokenStorage } from '../utils/tokenStorage';

// Lets the server log which kind of device signed in / booked a ride
// (admin "recent logins" view), e.g. "ios 18.1".
export const CLIENT_PLATFORM = `${Platform.OS} ${Platform.Version}`;

// ── Create the singleton axios instance ───────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 30_000,  // 30s — allows time for Railway cold start (sleeps after inactivity)
  headers: { 'Content-Type': 'application/json', 'X-Client-Platform': CLIENT_PLATFORM },
});

// ── Request interceptor — attach access token ──────────────────────────────
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await tokenStorage.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor — refresh token on 401 ───────────────────────────
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function drainQueue(token: string | null, err: unknown = null) {
  pendingQueue.forEach(({ resolve, reject }) =>
    token ? resolve(token) : reject(err),
  );
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // No response at all → network unreachable (offline, timeout, DNS failure)
    if (!error.response) {
      notifyNetworkError();
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue this request until the refresh is done
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const newAccess = await refreshAccessToken();
      drainQueue(newAccess);
      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (refreshErr) {
      drainQueue(null, refreshErr);
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

// ── Shared token refresh (single-flight) ──────────────────────────────────────
// Used by the 401 interceptor above AND by the WebSocket, whose handshake is
// rejected once the 15-minute access token expires. Concurrent callers share
// one in-flight refresh so the refresh token is never rotated twice at once.
let refreshInFlight: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) { return refreshInFlight; }
  refreshInFlight = (async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token');

    // JwtRefreshStrategy reads from Authorization header, NOT request body
    let data: { accessToken: string; refreshToken: string };
    try {
      ({ data } = await axios.post(
        `${Config.API_BASE_URL}/auth/refresh`,
        {},
        { headers: { Authorization: `Bearer ${refreshToken}`, 'X-Client-Platform': CLIENT_PLATFORM } },
      ));
    } catch (err) {
      // Only a definitive auth rejection means the session is over. A network
      // blip must not log the user out.
      const status = (err as AxiosError)?.response?.status;
      if (status === 401 || status === 403) {
        await tokenStorage.clear();
      }
      throw err;
    }

    await tokenStorage.set(data.accessToken, data.refreshToken);
    apiClient.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
    return data.accessToken;
  })();
  refreshInFlight.finally(() => { refreshInFlight = null; }).catch(() => {});
  return refreshInFlight;
}

export default apiClient;

import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import Config from '../config';
import { notifyNetworkError } from '../services/connectivity';
import { tokenStorage } from '../utils/tokenStorage';

// ── Create the singleton axios instance ───────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 30_000,  // 30s — allows time for Railway cold start (sleeps after inactivity)
  headers: { 'Content-Type': 'application/json' },
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
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      // JwtRefreshStrategy reads from Authorization header, NOT request body
      const { data } = await axios.post(
        `${Config.API_BASE_URL}/auth/refresh`,
        {},
        { headers: { Authorization: `Bearer ${refreshToken}` } },
      );
      const newAccess: string  = data.accessToken;
      const newRefresh: string = data.refreshToken;

      await tokenStorage.set(newAccess, newRefresh);

      apiClient.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
      drainQueue(newAccess);

      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (refreshErr) {
      drainQueue(null, refreshErr);
      // Clear tokens — force re-login
      await tokenStorage.clear();
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;

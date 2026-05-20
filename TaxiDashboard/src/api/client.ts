import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
} from 'axios';
import config from '../config';

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'taxi_access_token',
  REFRESH_TOKEN: 'taxi_refresh_token',
} as const;

// ── Axios instance ────────────────────────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach access token ─────────────────────────────────
apiClient.interceptors.request.use(
  (req: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) req.headers.Authorization = `Bearer ${token}`;
    return req;
  },
  (err) => Promise.reject(err),
);

// ── Response interceptor — refresh on 401 ────────────────────────────────────
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

function drainQueue(token: string | null, err: unknown = null) {
  pendingQueue.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(err)));
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
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
      const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) throw new Error('No refresh token');

      // JwtRefreshStrategy reads from Authorization header
      const { data } = await axios.post(
        `${config.API_BASE_URL}/auth/refresh`,
        {},
        { headers: { Authorization: `Bearer ${refreshToken}` } },
      );

      const newAccess: string = data.accessToken;
      const newRefresh: string = data.refreshToken;

      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newAccess);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);

      apiClient.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
      drainQueue(newAccess);

      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (refreshErr) {
      drainQueue(null, refreshErr);
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      // Redirect to login
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;

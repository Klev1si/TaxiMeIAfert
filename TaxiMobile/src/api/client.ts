import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from '../config';

// Storage keys (shared with authStore)
export const STORAGE_KEYS = {
  ACCESS_TOKEN: '@taxiapp/access_token',
  REFRESH_TOKEN: '@taxiapp/refresh_token',
} as const;

// ── Create the singleton axios instance ───────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach access token ──────────────────────────────
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
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
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await axios.post(
        `${Config.API_BASE_URL}/auth/refresh`,
        { refreshToken },
      );
      const newAccess: string = data.accessToken;
      const newRefresh: string = data.refreshToken;

      await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newAccess);
      await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);

      apiClient.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
      drainQueue(newAccess);

      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (refreshErr) {
      drainQueue(null, refreshErr);
      // Clear tokens — force re-login
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
      ]);
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;

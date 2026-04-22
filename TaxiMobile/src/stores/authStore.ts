import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/auth';
import { socketService } from '../services/socket';
import { STORAGE_KEYS } from '../api/client';
import type { AuthUser } from '../types/api';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isInitialized: boolean;

  /** Rehydrate tokens + user from AsyncStorage on app start */
  initialize: () => Promise<void>;

  /** Login with phone + password */
  login: (phone: string, password: string) => Promise<void>;

  /** Logout — clear tokens on server + local storage */
  logout: () => Promise<void>;

  /** Store new tokens (called by refresh interceptor too) */
  setTokens: (access: string, refresh: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const [access, refresh] = await AsyncStorage.multiGet([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
      ]);
      const accessToken = access[1];
      const refreshToken = refresh[1];

      if (accessToken && refreshToken) {
        // Decode the JWT payload to restore user info
        const payload = parseJwtPayload(accessToken);
        const user: AuthUser | null = payload
          ? { id: payload.sub, phone: payload.phone, role: payload.role as AuthUser['role'] }
          : null;

        set({ accessToken, refreshToken, user });

        // Connect socket if we have a valid token
        if (accessToken) {
          socketService.connect(accessToken);
        }
      }
    } catch (e) {
      console.warn('[AuthStore] initialize error:', e);
    } finally {
      set({ isInitialized: true });
    }
  },

  login: async (phone, password) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.login({ phone, password });
      const { accessToken, refreshToken, user: rawUser } = data;
      const user: AuthUser = {
        id: rawUser.id,
        phone: rawUser.phone,
        role: rawUser.role as AuthUser['role'],
      };
      await get().setTokens(accessToken, refreshToken);
      set({ user });
      socketService.connect(accessToken);
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Best-effort; continue even if server call fails
    }
    socketService.disconnect();
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
    ]);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  setTokens: async (access, refresh) => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.ACCESS_TOKEN, access],
      [STORAGE_KEYS.REFRESH_TOKEN, refresh],
    ]);
    set({ accessToken: access, refreshToken: refresh });
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
// React Native 0.71+ exposes atob globally — declare for TypeScript
declare function atob(input: string): string;

function parseJwtPayload(
  token: string,
): { sub: string; phone: string; role: string } | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

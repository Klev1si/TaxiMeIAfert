import { create } from 'zustand';
import { authApi } from '../api/auth';
import { socketService } from '../services/socket';
import { crash } from '../services/crashlytics';
import { track } from '../services/analytics';
import { tokenStorage } from '../utils/tokenStorage';
import type { AuthUser } from '../types/api';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isInitialized: boolean;

  /** Rehydrate tokens + user from secure Keychain storage on app start */
  initialize: () => Promise<void>;

  /** Login with phone + password */
  login: (phone: string, password: string) => Promise<void>;

  /** Login / sign up with a Google ID token from the SDK */
  loginWithGoogle: (idToken: string) => Promise<void>;

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
      const stored = await tokenStorage.getAll();
      const accessToken  = stored?.accessToken  ?? null;
      const refreshToken = stored?.refreshToken ?? null;

      if (accessToken && refreshToken) {
        // Decode the JWT payload to restore user info
        const payload = parseJwtPayload(accessToken);
        const user: AuthUser | null = payload
          ? { id: payload.sub, phone: payload.phone, role: payload.role as AuthUser['role'] }
          : null;

        set({ accessToken, refreshToken, user });
        if (user) { crash.setUser(user.id); crash.setAttribute('role', user.role); }

        // Connect the WebSocket — FCM is set up by RootNavigator.setupFcm()
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
      const { accessToken, refreshToken } = data;
      // Backend returns tokens only — decode user info from the JWT payload
      const payload = parseJwtPayload(accessToken);
      if (!payload) {
        throw new Error('Invalid token received from server');
      }
      const user: AuthUser = {
        id: payload.sub,
        phone: payload.phone,
        role: payload.role as AuthUser['role'],
      };
      await get().setTokens(accessToken, refreshToken);
      set({ user });
      crash.setUser(user.id);
      crash.setAttribute('role', user.role);
      track.login(user.role);
      socketService.connect(accessToken);
      // FCM token registration is handled by RootNavigator.setupFcm()
    } finally {
      set({ isLoading: false });
    }
  },

  loginWithGoogle: async (idToken) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.googleSignIn(idToken);
      const { accessToken, refreshToken } = data;
      const payload = parseJwtPayload(accessToken);
      if (!payload) throw new Error('Invalid token received from server');
      const user: AuthUser = {
        id: payload.sub,
        phone: payload.phone,
        role: payload.role as AuthUser['role'],
      };
      await get().setTokens(accessToken, refreshToken);
      set({ user });
      crash.setUser(user.id);
      crash.setAttribute('role', user.role);
      track.login(user.role);
      socketService.connect(accessToken);
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    // FCM token is cleared by RootNavigator when user becomes null
    try {
      await authApi.logout();
    } catch {
      // Best-effort; continue even if server call fails
    }
    crash.setUser(null);
    track.logout();
    socketService.disconnect();
    await tokenStorage.clear();
    set({ user: null, accessToken: null, refreshToken: null });
  },

  setTokens: async (access, refresh) => {
    await tokenStorage.set(access, refresh);
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

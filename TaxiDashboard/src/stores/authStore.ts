import { create } from 'zustand';
import { authApi } from '../api/auth';
import { STORAGE_KEYS } from '../api/client';
import type { AuthUser } from '../types/api';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) {
      set({ isInitialized: true });
      return;
    }
    try {
      const payload = parseJwtPayload(token);
      if (payload) {
        set({ user: { id: payload.sub, phone: payload.phone, role: payload.role } });
      }
    } catch {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    } finally {
      set({ isInitialized: true });
    }
  },

  login: async (phone, password) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.login(phone, password);
      const payload = parseJwtPayload(data.accessToken);
      if (!payload) throw new Error('Invalid token received');

      // Only allow admin and company roles to access the dashboard
      if (payload.role !== 'super_admin' && payload.role !== 'company') {
        throw new Error('Access denied. This dashboard is for admins and company accounts only.');
      }

      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);

      set({ user: { id: payload.sub, phone: payload.phone, role: payload.role } });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* best-effort */ }
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    set({ user: null });
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseJwtPayload(token: string): { sub: string; phone: string; role: 'super_admin' | 'company' | 'driver' | 'client' } | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

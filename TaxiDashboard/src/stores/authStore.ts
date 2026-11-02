import { create } from 'zustand';
import { authApi } from '../api/auth';
import { refreshAccessToken, setAccessToken } from '../api/client';
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
    // No token is stored in the browser. Ask the API for a fresh access token
    // using the httpOnly refresh cookie; if there's no valid session, the
    // user lands on the login page.
    try {
      const token = await refreshAccessToken();
      const payload = parseJwtPayload(token);
      if (payload && (payload.role === 'super_admin' || payload.role === 'company')) {
        set({ user: { id: payload.sub, phone: payload.phone, role: payload.role } });
      } else {
        setAccessToken(null);
      }
    } catch {
      setAccessToken(null);
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

      // The refresh token was set by the API as an httpOnly cookie; the
      // access token stays in memory only.
      setAccessToken(data.accessToken);

      set({ user: { id: payload.sub, phone: payload.phone, role: payload.role } });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    // The API clears the refresh cookie and revokes the session.
    try { await authApi.logout(); } catch { /* best-effort */ }
    setAccessToken(null);
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

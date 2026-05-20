import apiClient from './client';
import type { AuthTokens, AuthUser } from '../types/api';

export const authApi = {
  /** Login with phone + password */
  login: (phone: string, password: string) =>
    apiClient.post<AuthTokens & { expiresIn: number }>('/auth/login', { phone, password }),

  /** GET /auth/me — full profile for the current user */
  getMe: () =>
    apiClient.get<AuthUser & {
      firstName?: string | null;
      lastName?: string | null;
    }>('/auth/me'),

  /** Logout — invalidates refresh token on server */
  logout: () => apiClient.post('/auth/logout'),
};

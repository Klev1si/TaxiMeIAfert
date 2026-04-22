import apiClient from './client';
import type { AuthTokens } from '../types/api';

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface RegisterClientPayload {
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface RegisterDriverPayload {
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColor?: string;
  companyId?: string;
}

export const authApi = {
  /** Send OTP to phone number — returns 204 No Content */
  sendOtp: (phone: string) =>
    apiClient.post<void>('/auth/send-otp', { phone }),

  /** Verify OTP — returns 204 No Content on success, throws on failure */
  verifyOtp: (phone: string, code: string) =>
    apiClient.post<void>('/auth/verify-otp', { phone, code }),

  /** Login with phone + password */
  login: (payload: LoginPayload) =>
    apiClient.post<AuthTokens & { user: { id: string; phone: string; role: string } }>(
      '/auth/login',
      payload,
    ),

  /** Register a new client account */
  registerClient: (payload: RegisterClientPayload) =>
    apiClient.post('/auth/register/client', payload),

  /** Register a new driver account */
  registerDriver: (payload: RegisterDriverPayload) =>
    apiClient.post('/auth/register/driver', payload),

  /** Refresh access token */
  refresh: (refreshToken: string) =>
    apiClient.post<AuthTokens>('/auth/refresh', { refreshToken }),

  /** Logout — invalidates refresh token on server */
  logout: () => apiClient.post('/auth/logout'),
};

import apiClient from './client';
import type { AuthTokens } from '../types/api';
import type { VehicleType } from './rides';

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface RegisterClientPayload {
  phone: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface RegisterDriverPayload {
  phone: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColor?: string;
  vehicleType?: VehicleType;
  companyId?: string;
}

export interface RegisterCompanyPayload {
  phone: string;
  email: string;
  password: string;
  companyName: string;
  address?: string;
  city?: string;
}

export type ResetMethod = 'email' | 'sms';

export interface ForgotPasswordPayload {
  method:     ResetMethod;
  identifier: string;
}

export interface ResetPasswordPayload {
  method:      ResetMethod;
  identifier:  string;
  code:        string;
  newPassword: string;
}

export const authApi = {
  /** Send OTP to phone number — returns 204 No Content */
  sendOtp: (phone: string) =>
    apiClient.post<void>('/auth/send-otp', { phone }),

  /** Verify OTP — returns 204 No Content on success, throws on failure */
  verifyOtp: (phone: string, code: string) =>
    apiClient.post<void>('/auth/verify-otp', { phone, code }),

  /** Login with phone + password — returns tokens only (user decoded from JWT) */
  login: (payload: LoginPayload) =>
    apiClient.post<AuthTokens & { expiresIn: number }>('/auth/login', payload),

  /** Register a new client account */
  registerClient: (payload: RegisterClientPayload) =>
    apiClient.post('/auth/register/client', payload),

  /** Register a new driver account */
  registerDriver: (payload: RegisterDriverPayload) =>
    apiClient.post('/auth/register/driver', payload),

  /** Register a new company account */
  registerCompany: (payload: RegisterCompanyPayload) =>
    apiClient.post('/auth/register/company', payload),

  /** Refresh access token */
  refresh: (refreshToken: string) =>
    apiClient.post<AuthTokens>('/auth/refresh', { refreshToken }),

  /** GET /auth/me — full profile for the current user */
  getMe: () =>
    apiClient.get<{
      id: string; phone: string; email: string | null; role: string;
      avatarUrl: string | null;
      firstName: string | null; lastName: string | null; rating: number | null;
      // driver-only
      isApproved?: boolean; licenseNumber?: string | null;
      vehicleMake?: string | null; vehicleModel?: string | null;
      vehiclePlate?: string | null; vehicleColor?: string | null;
      vehicleYear?: number | null; vehicleType?: VehicleType | null;
    }>('/auth/me'),

  /** Logout — invalidates refresh token on server */
  logout: () => apiClient.post('/auth/logout'),

  /** PATCH /auth/fcm-token — register or clear the FCM push token */
  updateFcmToken: (fcmToken: string | null) =>
    apiClient.patch('/auth/fcm-token', { fcmToken }),

  /** PATCH /auth/email — let an existing account add or update their email */
  setEmail: (email: string) =>
    apiClient.patch('/auth/email', { email }),

  /** POST /auth/forgot-password — request a reset code via email or SMS */
  forgotPassword: (payload: ForgotPasswordPayload) =>
    apiClient.post<void>('/auth/forgot-password', payload),

  /** POST /auth/reset-password — verify code + set new password */
  resetPassword: (payload: ResetPasswordPayload) =>
    apiClient.post<void>('/auth/reset-password', payload),

  /** PATCH /auth/profile — update editable fields for the current role. */
  updateProfile: (payload: {
    // Client + driver
    firstName?:    string;
    lastName?:     string;
    // Driver only
    vehicleColor?: string;
    vehicleMake?:  string;
    vehicleModel?: string;
    vehicleYear?:  number;
    // Company only
    companyName?:  string;
    address?:      string;
    city?:         string;
    logoUrl?:      string;
  }) =>
    apiClient.patch('/auth/profile', payload),

  /** PATCH /auth/change-password — verifies current password then saves new one */
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiClient.patch('/auth/change-password', payload),

  /**
   * POST /auth/avatar — upload a profile photo.
   * `formData` must contain a field named "avatar" with the image file.
   * Returns { avatarUrl: string } — relative path, prepend API_BASE_URL to display.
   */
  uploadAvatar: (formData: FormData) =>
    apiClient.post<{ avatarUrl: string }>('/auth/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  /** DELETE /auth/avatar — remove the current profile photo */
  removeAvatar: () =>
    apiClient.delete('/auth/avatar'),

  /**
   * DELETE /auth/account — permanently anonymises the account (GDPR).
   * All personal data is erased; the user is signed out automatically.
   * Returns 204 No Content on success.
   */
  deleteAccount: () =>
    apiClient.delete('/auth/account'),
};

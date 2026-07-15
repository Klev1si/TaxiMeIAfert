import apiClient from './client';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface AdminStats {
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  activeDrivers: number;
  pendingDrivers: number;
  totalClients: number;
  totalCompanies: number;
}

export interface AdminDriver {
  id: string;
  userId: string;
  companyId: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColor: string | null;
  isApproved: boolean;
  isOnline: boolean;
  rating: number;
  totalRides: number;
  totalAccepted: number;
  totalDeclined: number;
  acceptanceRate: number | null;
  createdAt: string;
}

export interface AdminDriversResponse {
  drivers: AdminDriver[];
  total: number;
}

export interface AdminCompany {
  id: string;
  userId: string;
  phone: string | null;
  name: string;
  address: string | null;
  city: string | null;
  isApproved: boolean;
  approvedAt: string | null;
  createdAt: string;
}

export interface AdminCompaniesResponse {
  companies: AdminCompany[];
  total: number;
}

export interface AdminClient {
  id: string;
  userId: string;
  phone: string | null;
  email: string | null;
  isPhoneVerified: boolean;
  isActive: boolean;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  rating: number;
  totalRides: number;
  createdAt: string;
}

export interface AdminClientsResponse {
  clients: AdminClient[];
  total: number;
}

export interface AnalyticsDayPoint {
  date: string;
  total: number;
  completed: number;
  cancelled: number;
}

export interface TopDriver {
  name: string;
  plate: string;
  rides: number;
  rating: number;
}

export interface Analytics {
  ridesPerDay: AnalyticsDayPoint[];
  statusBreakdown: { status: string; count: number }[];
  topDrivers: TopDriver[];
}

// ── Promo Codes ───────────────────────────────────────────────────────────────

export type PromoDiscountType = 'flat' | 'percent';

export interface AdminPromoCode {
  id:                string;
  code:              string;
  description:       string | null;
  discountType:      PromoDiscountType;
  discountValue:     number;
  maxDiscountAmount: number | null;
  minimumFare:       number | null;
  maxUses:           number | null;
  usedCount:         number;
  usesRemaining:     number | null;
  expiresAt:         string | null;
  isActive:          boolean;
  isValid:           boolean;
  createdAt:         string;
}

export interface AdminPromoCodesResponse {
  codes: AdminPromoCode[];
  total: number;
}

export interface CreatePromoPayload {
  code:               string;
  description?:       string;
  discountType:       PromoDiscountType;
  discountValue:      number;
  maxDiscountAmount?: number;
  minimumFare?:       number;
  maxUses?:           number;
  expiresAt?:         string;  // ISO-8601
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

export interface AdminAuditLog {
  id:          string;
  adminId:     string;
  adminPhone:  string | null;
  action:      string;
  targetType:  string;
  targetId:    string | null;
  metadata:    Record<string, unknown> | null;
  createdAt:   string;
}

export interface AdminAuditLogsResponse {
  logs:  AdminAuditLog[];
  total: number;
}

// ── Fraud Events ──────────────────────────────────────────────────────────────

export type FraudEventType =
  | 'concurrent_ride_attempt'
  | 'gps_spoof_detected'
  | 'otp_lockout'
  | 'promo_abuse';

export interface AdminFraudEvent {
  id:        string;
  type:      FraudEventType;
  userId:    string | null;
  driverId:  string | null;
  rideId:    string | null;
  metadata:  Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminFraudEventsResponse {
  events: AdminFraudEvent[];
  total:  number;
}

// ── Driver Wallets / Payouts ──────────────────────────────────────────────────

export interface AdminDriverBalance {
  driverId:     string;
  firstName:    string;
  lastName:     string;
  vehiclePlate: string;
  totalCredits: number;
  totalPayouts: number;
  balance:      number;
}

export interface AdminDriverBalancesResponse {
  drivers: AdminDriverBalance[];
  total:   number;
}

export type LedgerEntryType = 'credit' | 'payout';

export interface AdminLedgerEntry {
  id:            string;
  type:          LedgerEntryType;
  amount:        number;
  rideId:        string | null;
  commissionPct: number | null;
  note:          string | null;
  createdAt:     string;
}

export interface AdminDriverWallet {
  driverId:     string;
  totalCredits: number;
  totalPayouts: number;
  balance:      number;
  entries:      AdminLedgerEntry[];
}

// ── Global Tariffs ────────────────────────────────────────────────────────────

export type VehicleType = 'economy' | 'comfort' | 'xl';

export interface AdminGlobalTariff {
  id:              string;
  name:            string;
  baseFare:        number;
  perKmRate:       number;
  perMinuteRate:   number;
  minimumFare:     number;
  surgeMultiplier: number;
  vehicleType:     VehicleType | null;
  isNightTariff:   boolean;
  nightStartHour:  number | null;
  nightEndHour:    number | null;
  isActive:        boolean;
  createdAt:       string;
}

export interface CreateGlobalTariffPayload {
  name:             string;
  baseFare:         number;
  perKmRate:        number;
  perMinuteRate:    number;
  minimumFare:      number;
  surgeMultiplier?: number;
  isNightTariff?:   boolean;
  nightStartHour?:  number;
  nightEndHour?:    number;
  vehicleType?:     VehicleType;
}

export interface UpdateGlobalTariffPayload {
  name?:             string;
  baseFare?:         number;
  perKmRate?:        number;
  perMinuteRate?:    number;
  minimumFare?:      number;
  surgeMultiplier?:  number;
  isNightTariff?:    boolean;
  nightStartHour?:   number;
  nightEndHour?:     number;
  vehicleType?:      VehicleType | null;
}

// ── Subscription Plans ────────────────────────────────────────────────────────

export type PlanAudience  = 'company' | 'driver';
export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';

export interface AdminPlan {
  id:              string;
  name:            string;
  price:           number;
  billingPeriod:   BillingPeriod;
  maxDrivers:      number;
  features:        string[];
  targetAudience:  PlanAudience;
  isActive:        boolean;
  createdAt:       string;
}

export interface CreatePlanPayload {
  name:            string;
  price:           number;
  billingPeriod:   BillingPeriod;
  maxDrivers:      number;
  features?:       string[];
  targetAudience?: PlanAudience;
}

export interface UpdatePlanPayload {
  name?:           string;
  price?:          number;
  billingPeriod?:  BillingPeriod;
  maxDrivers?:     number;
  features?:       string[];
  targetAudience?: PlanAudience;
  isActive?:       boolean;
}

export const adminApi = {
  /** GET /admin/stats */
  getStats: () =>
    apiClient.get<AdminStats>('/admin/stats'),

  /** GET /admin/analytics?days= */
  getAnalytics: (days: 7 | 30 = 7) =>
    apiClient.get<Analytics>('/admin/analytics', { params: { days } }),

  /** GET /admin/drivers */
  getDrivers: (
    filter: 'all' | 'pending' | 'approved' = 'all',
    page = 1,
    limit = 20,
    search?: string,
  ) =>
    apiClient.get<AdminDriversResponse>('/admin/drivers', {
      params: { filter, page, limit, ...(search ? { search } : {}) },
    }),

  /** PATCH /admin/drivers/:id/approve */
  approveDriver: (id: string) =>
    apiClient.patch<{ message: string }>(`/admin/drivers/${id}/approve`),

  /** PATCH /admin/drivers/:id/reject */
  rejectDriver: (id: string, reason?: string) =>
    apiClient.patch<{ message: string }>(`/admin/drivers/${id}/reject`, { reason }),

  /** GET /admin/clients?page=1&limit=20&search= */
  getClients: (page = 1, limit = 20, search?: string) =>
    apiClient.get<AdminClientsResponse>('/admin/clients', {
      params: { page, limit, ...(search ? { search } : {}) },
    }),

  /** GET /admin/companies */
  getCompanies: (
    filter: 'all' | 'pending' | 'approved' = 'all',
    page = 1,
    limit = 20,
  ) =>
    apiClient.get<AdminCompaniesResponse>('/admin/companies', {
      params: { filter, page, limit },
    }),

  /** PATCH /admin/companies/:id/approve */
  approveCompany: (id: string) =>
    apiClient.patch<{ message: string }>(`/admin/companies/${id}/approve`),

  /** PATCH /admin/companies/:id/reject */
  rejectCompany: (id: string) =>
    apiClient.patch<{ message: string }>(`/admin/companies/${id}/reject`),

  // ── Promo codes ──────────────────────────────────────────────────────────────

  /** GET /admin/promo-codes?page=1&limit=20 */
  getPromoCodes: (page = 1, limit = 20) =>
    apiClient.get<AdminPromoCodesResponse>('/admin/promo-codes', { params: { page, limit } }),

  /** POST /admin/promo-codes */
  createPromoCode: (payload: CreatePromoPayload) =>
    apiClient.post<AdminPromoCode>('/admin/promo-codes', payload),

  /** PATCH /admin/promo-codes/:id — toggle active or update fields */
  updatePromoCode: (id: string, patch: Partial<{ isActive: boolean }>) =>
    apiClient.patch<AdminPromoCode>(`/admin/promo-codes/${id}`, patch),

  /** DELETE /admin/promo-codes/:id */
  deletePromoCode: (id: string) =>
    apiClient.delete(`/admin/promo-codes/${id}`),

  // ── Subscription plans ───────────────────────────────────────────────────────

  // ── Audit logs ───────────────────────────────────────────────────────────────

  /** GET /admin/audit-logs */
  getAuditLogs: (params: {
    page?:       number;
    limit?:      number;
    action?:     string;
    targetType?: string;
    from?:       string;
    to?:         string;
  } = {}) =>
    apiClient.get<AdminAuditLogsResponse>('/admin/audit-logs', { params }),

  // ── Fraud events ─────────────────────────────────────────────────────────────

  /** GET /admin/fraud/events */
  getFraudEvents: (params: {
    page?:      number;
    limit?:     number;
    type?:      FraudEventType;
    userId?:    string;
    driverId?:  string;
  } = {}) =>
    apiClient.get<AdminFraudEventsResponse>('/admin/fraud/events', { params }),

  // ── Driver wallets / payouts ─────────────────────────────────────────────────

  /** GET /admin/wallet/balances?page=&limit=&all= */
  getWalletBalances: (page = 1, limit = 20, showAll = false) =>
    apiClient.get<AdminDriverBalancesResponse>('/admin/wallet/balances', {
      params: { page, limit, ...(showAll ? { all: 'true' } : {}) },
    }),

  /** GET /admin/drivers/:driverId/wallet */
  getDriverWallet: (driverId: string) =>
    apiClient.get<AdminDriverWallet>(`/admin/drivers/${driverId}/wallet`),

  /** POST /admin/drivers/:driverId/payout */
  createPayout: (driverId: string, amount: number, note?: string) =>
    apiClient.post<AdminLedgerEntry>(`/admin/drivers/${driverId}/payout`, { amount, note }),

  // ── Global tariffs ───────────────────────────────────────────────────────────

  /** GET /admin/tariffs — all global (solo-driver) tariffs */
  getGlobalTariffs: () =>
    apiClient.get<AdminGlobalTariff[]>('/admin/tariffs'),

  /** POST /admin/tariffs */
  createGlobalTariff: (payload: CreateGlobalTariffPayload) =>
    apiClient.post<AdminGlobalTariff>('/admin/tariffs', payload),

  /** PATCH /admin/tariffs/:id */
  updateGlobalTariff: (id: string, payload: UpdateGlobalTariffPayload) =>
    apiClient.patch<AdminGlobalTariff>(`/admin/tariffs/${id}`, payload),

  /** DELETE /admin/tariffs/:id — soft-deactivates */
  deactivateGlobalTariff: (id: string) =>
    apiClient.delete(`/admin/tariffs/${id}`),

  // ── Subscription plans ───────────────────────────────────────────────────────

  /** GET /admin/plans — all plans (active + inactive) */
  getPlans: () =>
    apiClient.get<AdminPlan[]>('/admin/plans'),

  /** POST /admin/plans */
  createPlan: (payload: CreatePlanPayload) =>
    apiClient.post<AdminPlan>('/admin/plans', payload),

  /** PATCH /admin/plans/:id */
  updatePlan: (id: string, payload: UpdatePlanPayload) =>
    apiClient.patch<AdminPlan>(`/admin/plans/${id}`, payload),

  /** DELETE /admin/plans/:id — soft-deactivates the plan */
  deactivatePlan: (id: string) =>
    apiClient.delete(`/admin/plans/${id}`),
};

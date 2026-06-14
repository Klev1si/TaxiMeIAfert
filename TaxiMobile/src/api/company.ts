import apiClient from './client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompanyStats {
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  activeDrivers: number;
  pendingDrivers: number;
  totalClients: number;
  totalCompanies: number;
  driverCommissionPct?: number;
}

export interface CompanyDriver {
  id: string;
  userId: string;
  companyId: string;
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
  createdAt: string;
}

export interface DriversResponse {
  drivers: CompanyDriver[];
  total: number;
}

export interface CompanyTariff {
  id: string;
  name: string;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  isNightTariff: boolean;
  nightStartHour: number | null;
  nightEndHour: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface EarningsPerDriver {
  driverId: string;
  firstName: string | null;
  lastName: string | null;
  rides: number;
  totalFare: number;
  driverShare: number;
  companyShare: number;
}

export interface EarningsResponse {
  period: string;
  commissionPct: number;
  summary: {
    rides: number;
    totalFare: number;
    driverShare: number;
    companyShare: number;
  };
  perDriver: EarningsPerDriver[];
}

export interface AnalyticsDay {
  date:    string;   // 'YYYY-MM-DD'
  count:   number;
  revenue: number;
}

export interface AnalyticsResponse {
  period:      number;
  ridesPerDay: AnalyticsDay[];
  totals: { rides: number; revenue: number };
}

export interface AddDriverPayload {
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
}

export type PromoDiscountType = 'percent' | 'fixed';

export interface CompanyPromoCode {
  id: string;
  companyId: string;
  code: string;
  description: string | null;
  discountType: PromoDiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  minimumFare: number | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CompanyPromoPayload {
  code: string;
  description?: string;
  discountType: PromoDiscountType;
  discountValue: number;
  maxDiscountAmount?: number;
  minimumFare?: number;
  maxUses?: number;
  expiresAt?: string;
}

export interface TariffPayload {
  name: string;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  isNightTariff?: boolean;
  nightStartHour?: number;
  nightEndHour?: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const companyApi = {
  /** GET /company/stats */
  getStats: () =>
    apiClient.get<CompanyStats>('/company/stats'),

  /** GET /company/analytics?days=7|14|30 */
  getAnalytics: (days: 7 | 14 | 30 = 7) =>
    apiClient.get<AnalyticsResponse>(`/company/analytics?days=${days}`),

  /** GET /company/earnings?period=today|week|month|all */
  getEarnings: (period = 'all') =>
    apiClient.get<EarningsResponse>(`/company/earnings?period=${period}`),

  /** GET /company/drivers?filter=all|pending|approved&page=1&limit=20&search= */
  getDrivers: (filter: 'all' | 'pending' | 'approved' = 'all', page = 1, limit = 20, search?: string) =>
    apiClient.get<DriversResponse>('/company/drivers', {
      params: { filter, page, limit, ...(search ? { search } : {}) },
    }),

  /** POST /company/drivers */
  addDriver: (payload: AddDriverPayload) =>
    apiClient.post<CompanyDriver>('/company/drivers', payload),

  /** GET /company/tariffs */
  getTariffs: () =>
    apiClient.get<CompanyTariff[]>('/company/tariffs'),

  /** POST /company/tariffs */
  createTariff: (payload: TariffPayload) =>
    apiClient.post<CompanyTariff>('/company/tariffs', payload),

  /** PATCH /company/tariffs/:id */
  updateTariff: (id: string, payload: Partial<TariffPayload>) =>
    apiClient.patch<CompanyTariff>(`/company/tariffs/${id}`, payload),

  /** DELETE /company/tariffs/:id */
  deactivateTariff: (id: string) =>
    apiClient.delete(`/company/tariffs/${id}`),

  /** PATCH /company/commission */
  setCommission: (driverCommissionPct: number) =>
    apiClient.patch<{ driverCommissionPct: number }>('/company/commission', { driverCommissionPct }),

  // ── Promo codes ──────────────────────────────────────────────────────────
  /** GET /company/promo-codes */
  getPromoCodes: () =>
    apiClient.get<CompanyPromoCode[]>('/company/promo-codes'),

  /** POST /company/promo-codes */
  createPromoCode: (payload: CompanyPromoPayload) =>
    apiClient.post<CompanyPromoCode>('/company/promo-codes', payload),

  /** PATCH /company/promo-codes/:id */
  updatePromoCode: (id: string, payload: Partial<CompanyPromoPayload> & { isActive?: boolean }) =>
    apiClient.patch<CompanyPromoCode>(`/company/promo-codes/${id}`, payload),

  /** DELETE /company/promo-codes/:id */
  deletePromoCode: (id: string) =>
    apiClient.delete(`/company/promo-codes/${id}`),
};

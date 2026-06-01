import apiClient from './client';

export type FinancePeriod = 'today' | 'week' | 'month' | 'all';
export type SettlementDirection = 'cash_in' | 'card_out';

export interface DriverFinance {
  driverId:          string;
  firstName:         string;
  lastName:          string;
  vehiclePlate:      string;
  cashCollected:     number;
  cashOwedToCompany: number;
  cardTotal:         number;
  cardOwedToDriver:  number;
  expensesTotal:     number;
  // 3-way breakdown (driver / company / platform) for this driver
  driverEarning:     number;
  companyEarning:    number;
  platformEarning:   number;
  effectiveCommissionPct: number;
  hasCommissionOverride:  boolean;
}

export interface CompanySummary {
  cashRevenue:           number;
  cardRevenue:           number;
  totalRevenue:          number;
  cashOwedByDrivers:     number;
  cardOwedToDrivers:     number;
  // Card breakdown for transparency
  cardGross:             number;
  platformFee:           number;
  cardDriverShare:       number;
  driverExpenses:        number;
  companyCommissionPct:  number;
  driverCommissionPct:   number;
  platformCommissionPct: number;
}

export const companyFinancesApi = {
  getSummary: (period: FinancePeriod = 'all') =>
    apiClient.get<CompanySummary>('/company/finances/summary', { params: { period } }),

  getDrivers: (period: FinancePeriod = 'all') =>
    apiClient.get<DriverFinance[]>('/company/finances/drivers', { params: { period } }),

  settle: (driverId: string, payload: {
    direction: SettlementDirection;
    amount:    number;
    note?:     string;
  }) =>
    apiClient.post(`/company/finances/drivers/${driverId}/settle`, payload),

  /** Set or clear (`pct: null`) the per-driver commission override. */
  setCommission: (driverId: string, pct: number | null) =>
    apiClient.patch<{ effectivePct: number; hasOverride: boolean }>(
      `/company/finances/drivers/${driverId}/commission`,
      { pct },
    ),
};

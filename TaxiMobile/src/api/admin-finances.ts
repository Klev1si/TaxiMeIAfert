import apiClient from './client';

export type FinancePeriod = 'today' | 'week' | 'month' | 'all';

export interface AdminDriverFinance {
  driverId:       string;
  firstName:      string;
  lastName:       string;
  vehiclePlate:   string;
  companyId:      string | null;
  companyName:    string | null;
  cashTotal:      number;
  cardTotal:      number;
  driverEarning:  number;
  companyEarning: number;
  platformEarning: number;
  cardDueToDriver: number;
  effectiveCommissionPct: number;
}

export interface AdminCompanyFinance {
  companyId:       string;
  companyName:     string;
  driverCount:     number;
  cashTotal:       number;
  cardTotal:       number;
  driverEarning:   number;
  companyEarning:  number;
  platformEarning: number;
  cardDueToDrivers: number;
}

export const adminFinancesApi = {
  getDrivers: (period: FinancePeriod = 'all') =>
    apiClient.get<AdminDriverFinance[]>('/admin/finances/drivers', { params: { period } }),

  getCompanies: (period: FinancePeriod = 'all') =>
    apiClient.get<AdminCompanyFinance[]>('/admin/finances/companies', { params: { period } }),
};

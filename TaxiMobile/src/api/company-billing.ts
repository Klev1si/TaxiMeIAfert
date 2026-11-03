import apiClient from './client';

/** How a company pays the platform (chosen by the admin per company). */
export type CompanyBillingModel = 'unassigned' | 'subscription' | 'commission';
export type BillingStatementPeriod = 'today' | 'week' | 'month' | 'all';

export interface CommissionStatement {
  /** 'company', or 'driver' for a solo driver's own contract. */
  subject:       'company' | 'driver';
  /** Company id, or driver id when subject = 'driver'. */
  companyId:     string;
  companyName:   string;
  billingModel:  CompanyBillingModel;
  commissionPct: number | null;
  setAt:         string | null;
  period:  { name: BillingStatementPeriod; rides: number; grossFare: number; commission: number };
  /** withheld = commission already kept from card rides (solo drivers). */
  allTime: { commission: number; withheld: number; paid: number; balance: number };
  payments: Array<{ id: string; amount: number; note: string | null; createdAt: string }>;
}

export const companyBillingApi = {
  /** Company: my contract and commission statement. */
  getMine: (period: BillingStatementPeriod = 'month') =>
    apiClient.get<CommissionStatement>('/company/billing', { params: { period } }),

  /** Super-admin: one company's contract and statement. */
  adminGet: (companyId: string, period: BillingStatementPeriod = 'month') =>
    apiClient.get<CommissionStatement>(`/admin/companies/${companyId}/billing`, { params: { period } }),

  /** Super-admin: set the contract (commissionPct required for 'commission'). */
  adminSet: (companyId: string, billingModel: CompanyBillingModel, commissionPct?: number) =>
    apiClient.put<CommissionStatement>(`/admin/companies/${companyId}/billing`, {
      billingModel,
      ...(billingModel === 'commission' ? { commissionPct } : {}),
    }),

  /** Super-admin: record a payment received from the company. */
  adminRecordPayment: (companyId: string, amount: number, note?: string) =>
    apiClient.post<CommissionStatement>(`/admin/companies/${companyId}/commission-payments`, {
      amount,
      ...(note ? { note } : {}),
    }),

  /** Solo driver: my contract and commission statement. */
  getMineDriver: (period: BillingStatementPeriod = 'month') =>
    apiClient.get<CommissionStatement>('/driver/billing', { params: { period } }),
};

/** Super-admin endpoints for a company or a solo driver. */
export function adminContractApi(subject: 'company' | 'driver', id: string) {
  const base = subject === 'driver' ? `/admin/drivers/${id}` : `/admin/companies/${id}`;
  return {
    get: (period: BillingStatementPeriod = 'month') =>
      apiClient.get<CommissionStatement>(`${base}/billing`, { params: { period } }),
    set: (billingModel: CompanyBillingModel, commissionPct?: number) =>
      apiClient.put<CommissionStatement>(`${base}/billing`, {
        billingModel,
        ...(billingModel === 'commission' ? { commissionPct } : {}),
      }),
    recordPayment: (amount: number, note?: string) =>
      apiClient.post<CommissionStatement>(`${base}/commission-payments`, { amount, ...(note ? { note } : {}) }),
  };
}

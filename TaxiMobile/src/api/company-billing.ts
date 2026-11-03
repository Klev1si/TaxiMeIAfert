import apiClient from './client';

/** How a company pays the platform (chosen by the admin per company). */
export type CompanyBillingModel = 'unassigned' | 'subscription' | 'commission';
export type BillingStatementPeriod = 'today' | 'week' | 'month' | 'all';

export interface CommissionStatement {
  companyId:     string;
  companyName:   string;
  billingModel:  CompanyBillingModel;
  commissionPct: number | null;
  setAt:         string | null;
  period:  { name: BillingStatementPeriod; rides: number; grossFare: number; commission: number };
  allTime: { commission: number; paid: number; balance: number };
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
};

/** Company contract with the platform (see API company-billing). */
export type BillingModel = 'unassigned' | 'subscription' | 'commission';

export interface CommissionStatement {
  companyId:     string;
  companyName:   string;
  billingModel:  BillingModel;
  commissionPct: number | null;
  setAt:         string | null;
  period:  { name: string; rides: number; grossFare: number; commission: number };
  allTime: { commission: number; paid: number; balance: number };
  payments: Array<{ id: string; amount: number; note: string | null; createdAt: string }>;
}

export const CONTRACT_LABEL: Record<BillingModel, string> = {
  unassigned:   'Not set',
  subscription: 'Subscription',
  commission:   'Commission',
};

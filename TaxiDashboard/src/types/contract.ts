/** Company contract with the platform (see API company-billing). */
export type BillingModel = 'unassigned' | 'subscription' | 'commission';

export interface CommissionStatement {
  subject?:      'company' | 'driver';
  companyId:     string;
  companyName:   string;
  billingModel:  BillingModel;
  commissionPct: number | null;
  setAt:         string | null;
  period:  { name: string; rides: number; grossFare: number; commission: number };
  /** withheld = commission already kept from card rides (solo drivers). */
  allTime: { commission: number; withheld: number; paid: number; balance: number };
  payments: Array<{ id: string; amount: number; note: string | null; createdAt: string }>;
}

export const CONTRACT_LABEL: Record<BillingModel, string> = {
  unassigned:   'Not set',
  subscription: 'Subscription',
  commission:   'Commission',
};

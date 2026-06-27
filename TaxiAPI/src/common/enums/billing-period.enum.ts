export enum BillingPeriod {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export const BILLING_PERIOD_DAYS: Record<BillingPeriod, number> = {
  [BillingPeriod.MONTHLY]: 30,
  [BillingPeriod.QUARTERLY]: 90,
  [BillingPeriod.YEARLY]: 365,
};

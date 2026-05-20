import apiClient from './client';

export type PlanAudience    = 'company' | 'driver';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled';

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceMonthly: string; // decimal string from DB
  maxDrivers: number;
  features: string[];
  targetAudience: PlanAudience;
  stripePriceId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CompanySubscription {
  id: string;
  companyId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
  plan: SubscriptionPlan;
}

export interface DriverSubscription {
  id: string;
  driverId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
  plan: SubscriptionPlan;
}

export const subscriptionsApi = {
  // ── Company ──────────────────────────────────────────────────────────────

  /** GET /subscriptions/plans?audience=company — company plans */
  listPlans: () =>
    apiClient.get<SubscriptionPlan[]>('/subscriptions/plans', {
      params: { audience: 'company' },
    }),

  /** GET /subscriptions/my — current company subscription */
  getMy: () =>
    apiClient.get<CompanySubscription | null>('/subscriptions/my'),

  /** POST /subscriptions/subscribe */
  subscribe: (planId: string) =>
    apiClient.post<CompanySubscription>('/subscriptions/subscribe', { planId }),

  /** POST /subscriptions/cancel */
  cancel: () =>
    apiClient.post<CompanySubscription>('/subscriptions/cancel'),

  // ── Driver ────────────────────────────────────────────────────────────────

  /** GET /subscriptions/plans?audience=driver — driver plans */
  listDriverPlans: () =>
    apiClient.get<SubscriptionPlan[]>('/subscriptions/plans', {
      params: { audience: 'driver' },
    }),

  /** GET /subscriptions/driver/my — current driver subscription */
  getDriverMy: () =>
    apiClient.get<DriverSubscription | null>('/subscriptions/driver/my'),

  /** POST /subscriptions/driver/subscribe */
  driverSubscribe: (planId: string) =>
    apiClient.post<DriverSubscription>('/subscriptions/driver/subscribe', { planId }),

  /** POST /subscriptions/driver/cancel */
  driverCancel: () =>
    apiClient.post<DriverSubscription>('/subscriptions/driver/cancel'),
};

import apiClient from './client';

export type PlanAudience       = 'company' | 'driver';
export type BillingPeriod      = 'monthly' | 'quarterly' | 'yearly';
export type PaymentMethod      = 'card' | 'cash';
export type SubscriptionStatus = 'active' | 'pending' | 'trialing' | 'past_due' | 'cancelled';
export type SubscriptionState  = 'inactive' | 'active' | 'grace' | 'blocked';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;            // decimal string from DB
  billingPeriod: BillingPeriod;
  maxDrivers: number;
  features: string[];
  targetAudience: PlanAudience;
  isActive: boolean;
  createdAt: string;
}

export interface CompanySubscription {
  id: string;
  companyId: string;
  planId: string;
  status: SubscriptionStatus;
  paymentMethod: PaymentMethod;
  payseraOrderId: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
  plan: SubscriptionPlan;
  /** Computed by the backend on /subscriptions/my. */
  state?: SubscriptionState;
}

export interface DriverSubscription {
  id: string;
  driverId: string;
  planId: string;
  status: SubscriptionStatus;
  paymentMethod: PaymentMethod;
  payseraOrderId: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
  plan: SubscriptionPlan;
}

/** New shape returned by GET /subscriptions/driver/my. */
export interface DriverSubscriptionView {
  subscription: DriverSubscription | null;
  state: SubscriptionState;
  coveredBy: 'driver' | 'company' | 'none';
  effectivePeriodEnd: string | null;
}

export interface CheckoutResponse {
  url: string;
  orderId: string;
  subscriptionId: string;
}

export const subscriptionsApi = {
  // ── Company ────────────────────────────────────────────────────────────────

  listPlans: () =>
    apiClient.get<SubscriptionPlan[]>('/subscriptions/plans', {
      params: { audience: 'company' },
    }),

  getMy: () =>
    apiClient.get<CompanySubscription | null>('/subscriptions/my'),

  /** Legacy direct-subscribe (server still grants the period; no payment). */
  subscribe: (planId: string) =>
    apiClient.post<CompanySubscription>('/subscriptions/subscribe', { planId }),

  cancel: () =>
    apiClient.post<CompanySubscription>('/subscriptions/cancel'),

  // ── Driver ─────────────────────────────────────────────────────────────────

  listDriverPlans: () =>
    apiClient.get<SubscriptionPlan[]>('/subscriptions/plans', {
      params: { audience: 'driver' },
    }),

  getDriverMy: () =>
    apiClient.get<DriverSubscriptionView>('/subscriptions/driver/my'),

  driverSubscribe: (planId: string) =>
    apiClient.post<DriverSubscription>('/subscriptions/driver/subscribe', { planId }),

  driverCancel: () =>
    apiClient.post<DriverSubscription>('/subscriptions/driver/cancel'),

  // ── Payment flows (shared for driver & company) ────────────────────────────

  /** POST /subscriptions/checkout — returns Paysera URL to open externally. */
  startCardCheckout: (planId: string) =>
    apiClient.post<CheckoutResponse>('/subscriptions/checkout', { planId }),

  /** POST /subscriptions/cash-request — pending until admin confirms. */
  requestCashPayment: (planId: string) =>
    apiClient.post<{ subscriptionId: string }>('/subscriptions/cash-request', { planId }),
};

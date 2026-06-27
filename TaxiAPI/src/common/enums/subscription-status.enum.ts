export enum SubscriptionStatus {
  /** Card checkout started, awaiting Paysera callback. */
  PENDING = 'pending',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  TRIALING = 'trialing',
}

import { SubscriptionStatus } from './enums/index.js';

/** Days after the period ends before access is blocked. */
export const GRACE_PERIOD_DAYS = 3;

export type SubscriptionState =
  | 'inactive'  // no subscription at all, or PENDING (never paid)
  | 'active'    // within paid period
  | 'grace'    // past period_end, within grace window — still allowed
  | 'blocked'; // past grace window OR cancelled — must renew

/**
 * Compute working state from a subscription row.
 * `null` means no subscription exists.
 */
export function computeSubscriptionState(
  sub: { status: SubscriptionStatus; currentPeriodEnd: Date } | null,
  now: Date = new Date(),
): SubscriptionState {
  if (!sub) return 'inactive';
  if (sub.status === SubscriptionStatus.PENDING) return 'inactive';
  if (sub.status === SubscriptionStatus.CANCELLED) return 'blocked';

  const end = new Date(sub.currentPeriodEnd).getTime();
  const nowMs = now.getTime();
  if (nowMs <= end) return 'active';

  const graceEnd = end + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  if (nowMs <= graceEnd) return 'grace';
  return 'blocked';
}

export function isWorkingAllowed(state: SubscriptionState): boolean {
  return state === 'active' || state === 'grace';
}

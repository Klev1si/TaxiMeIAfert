/**
 * analytics.ts — thin wrapper around @react-native-firebase/analytics.
 *
 * Keeps all event names and shapes in one place so:
 *  • Renaming an event is a single-line change
 *  • TypeScript catches typos in event params
 *  • Swapping Firebase for another provider (Mixpanel, Amplitude) touches
 *    only this file
 *
 * Usage:
 *   import { track } from '../services/analytics';
 *   track.login('client');
 *   track.rideRequested(rideId);
 */

let _analytics: typeof import('@react-native-firebase/analytics').default | null =
  null;

function getAnalytics() {
  if (_analytics) return _analytics;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _analytics = require('@react-native-firebase/analytics').default;
  } catch {
    _analytics = null;
  }
  return _analytics;
}

async function log(name: string, params?: Record<string, string | number | boolean>) {
  try {
    await getAnalytics()?.().logEvent(name, params);
  } catch { /* no-op — never crash the app for analytics */ }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const track = {

  /** User signed in successfully */
  login(role: string) {
    void log('login', { role });
    try { getAnalytics()?.().setUserProperty('role', role); } catch { /* no-op */ }
  },

  /** User registered a new account */
  signUp(role: string) {
    void log('sign_up', { role });
  },

  /** User logged out */
  logout() {
    void log('logout');
  },

  // ── Ride flow ──────────────────────────────────────────────────────────────

  /** Client submitted a ride request */
  rideRequested(rideId: string) {
    void log('ride_requested', { ride_id: rideId });
  },

  /** Driver accepted a ride */
  rideAccepted(rideId: string) {
    void log('ride_accepted', { ride_id: rideId });
  },

  /** Client or driver cancelled */
  rideCancelled(rideId: string, cancelledBy: 'client' | 'driver', reason?: string) {
    void log('ride_cancelled', {
      ride_id:      rideId,
      cancelled_by: cancelledBy,
      ...(reason ? { reason } : {}),
    });
  },

  /** Ride marked in_progress (driver started the trip) */
  rideStarted(rideId: string) {
    void log('ride_started', { ride_id: rideId });
  },

  /** Ride completed by driver */
  rideCompleted(rideId: string, fareUsd: number, distanceKm: number) {
    void log('ride_completed', {
      ride_id:     rideId,
      fare_usd:    fareUsd,
      distance_km: distanceKm,
    });
    // Firebase's built-in purchase event for revenue tracking
    try {
      getAnalytics()?.().logPurchase({
        value:    fareUsd,
        currency: 'USD',
        items:    [{ item_id: rideId, item_name: 'ride' }],
      });
    } catch { /* no-op */ }
  },

  // ── Payments ───────────────────────────────────────────────────────────────

  /** Client opened the payment method selection screen */
  paymentScreenViewed(rideId: string) {
    void log('payment_screen_viewed', { ride_id: rideId });
  },

  /** Client chose a payment method */
  paymentMethodSelected(method: 'cash' | 'card') {
    void log('payment_method_selected', { method });
  },

  /** Stripe payment sheet opened */
  stripeSheetOpened(rideId: string) {
    void log('stripe_sheet_opened', { ride_id: rideId });
  },

  /** Payment confirmed (either cash or card) */
  paymentConfirmed(rideId: string, method: 'cash' | 'card') {
    void log('payment_confirmed', { ride_id: rideId, method });
  },

  /** Stripe payment failed */
  paymentFailed(rideId: string, reason: string) {
    void log('payment_failed', { ride_id: rideId, reason: reason.slice(0, 100) });
  },

  // ── Ratings ────────────────────────────────────────────────────────────────

  /** User submitted a rating */
  ratingSubmitted(rideId: string, rating: number, rateTarget: 'driver' | 'client') {
    void log('rating_submitted', { ride_id: rideId, rating, rate_target: rateTarget });
  },

  /** User skipped the rating screen */
  ratingSkipped(rideId: string) {
    void log('rating_skipped', { ride_id: rideId });
  },

  // ── Screen tracking ────────────────────────────────────────────────────────

  /** Log the current screen name (call from each screen's useEffect) */
  screen(screenName: string, screenClass?: string) {
    try {
      getAnalytics()?.().logScreenView({
        screen_name:  screenName,
        screen_class: screenClass ?? screenName,
      });
    } catch { /* no-op */ }
  },
};

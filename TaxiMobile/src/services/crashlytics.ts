/**
 * crashlytics.ts — thin wrapper around @react-native-firebase/crashlytics.
 *
 * Why a wrapper?
 *  • Gracefully no-ops in environments where Crashlytics is unavailable
 *    (Jest, Storybook, first run before google-services.json is configured).
 *  • Single import across the codebase — swap the backend (e.g. Sentry)
 *    without touching every call site.
 *  • Adds typed helpers so callers don't need to know the Firebase API.
 *
 * Usage:
 *   import { crash } from '../services/crashlytics';
 *
 *   crash.setUser(userId);
 *   crash.log('Ride accepted');
 *   crash.recordError(err, 'PaymentsService.createIntent');
 *   crash.setAttribute('rideId', rideId);
 */

let _crashlytics: typeof import('@react-native-firebase/crashlytics').default | null =
  null;

function getCrashlytics() {
  if (_crashlytics) return _crashlytics;
  try {
    // Dynamic require so the module is tree-shaken in envs without native code
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _crashlytics = require('@react-native-firebase/crashlytics').default;
  } catch {
    _crashlytics = null;
  }
  return _crashlytics;
}

export const crash = {
  /**
   * Identify the logged-in user so crash reports are tied to an account.
   * Call this after login and clear it on logout.
   */
  setUser(userId: string | null) {
    try {
      const c = getCrashlytics();
      if (!c) return;
      if (userId) {
        void c().setUserId(userId);
      } else {
        void c().setUserId('');
      }
    } catch { /* no-op */ }
  },

  /**
   * Attach an arbitrary key-value pair to every crash report in this session.
   * Useful for attaching rideId, role, screen name, etc.
   */
  setAttribute(key: string, value: string) {
    try {
      void getCrashlytics()?.()?.setAttribute(key, value);
    } catch { /* no-op */ }
  },

  /**
   * Write a breadcrumb message visible in the Crashlytics crash timeline.
   * Use for important state transitions ("ride started", "payment sheet opened").
   */
  log(message: string) {
    try {
      void getCrashlytics()?.()?.log(message);
    } catch { /* no-op */ }
  },

  /**
   * Record a non-fatal error — appears in the "Non-fatals" tab in Firebase.
   * @param error   The Error object (or unknown thrown value).
   * @param context Short string identifying where the error came from,
   *                e.g. 'PaymentsService.createIntent'.
   */
  recordError(error: unknown, context?: string) {
    try {
      const c = getCrashlytics();
      if (!c) return;
      const err =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : JSON.stringify(error));
      if (context) { err.name = `[${context}] ${err.name}`; }
      void c().recordError(err);
    } catch { /* no-op */ }
  },
};

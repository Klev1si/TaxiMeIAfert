/**
 * inAppReview.ts
 *
 * Wraps react-native-in-app-review to show the native Play Store / App Store
 * review dialog at the right moment — after the user completes their Nth ride.
 *
 * Rules that protect the user experience:
 *  • Only shown after the user has completed at least MIN_RIDES_BEFORE_PROMPT rides
 *  • Never shown more than once every COOLDOWN_DAYS days
 *  • Never shown on the first session (give the user time to experience the app)
 *  • If the OS throttles the dialog (Play Store allows ~3 times / year),
 *    we silently do nothing — never fall back to a custom nag screen
 *
 * Google Play policy: you must NOT prompt right before or after a purchase,
 * and must NOT block the user flow. We call this AFTER navigation away from
 * the payment / rating screen so the ride flow is already complete.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_LAST_PROMPT  = '@taxiapp/review_last_prompt_ts';
const STORAGE_KEY_RIDES_DONE   = '@taxiapp/review_rides_completed';

const MIN_RIDES_BEFORE_PROMPT  = 3;          // show after 3rd completed ride
const COOLDOWN_DAYS            = 30;         // don't re-ask within 30 days
const COOLDOWN_MS              = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/**
 * Call this every time a ride is fully completed (after rating screen).
 * Increments the internal counter and triggers the prompt when appropriate.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    // 1. Check if the library is available (native module linked)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const InAppReview = require('react-native-in-app-review').default;
    if (!InAppReview.isAvailable()) { return; }

    // 2. Increment ride counter
    const rawCount  = await AsyncStorage.getItem(STORAGE_KEY_RIDES_DONE);
    const ridesDone = rawCount ? parseInt(rawCount, 10) : 0;
    const newCount  = ridesDone + 1;
    await AsyncStorage.setItem(STORAGE_KEY_RIDES_DONE, String(newCount));

    // 3. Not enough rides yet
    if (newCount < MIN_RIDES_BEFORE_PROMPT) { return; }

    // 4. Check cooldown — don't prompt again too soon
    const rawTs    = await AsyncStorage.getItem(STORAGE_KEY_LAST_PROMPT);
    const lastTs   = rawTs ? parseInt(rawTs, 10) : 0;
    const now      = Date.now();
    if (now - lastTs < COOLDOWN_MS) { return; }

    // 5. Show the native review dialog
    await AsyncStorage.setItem(STORAGE_KEY_LAST_PROMPT, String(now));
    InAppReview.RequestInAppReview();

  } catch {
    // Never crash the app over an analytics/review prompt
  }
}

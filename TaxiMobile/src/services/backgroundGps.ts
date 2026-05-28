/**
 * backgroundGps.ts
 *
 * Background GPS configuration for the driver app.
 *
 * Strategy on Android (the dominant platform here):
 *   - Geolocation.watchPosition() in DriverHomeScreen keeps the GPS feed
 *     coming as long as the app process is alive.
 *   - ACCESS_BACKGROUND_LOCATION permission lets the watcher continue to
 *     fire when the app is backgrounded / screen locked.
 *   - We ask the user for "Allow all the time" via the permission prompt
 *     below so location keeps flowing through Doze.
 *   - For very long idle sessions (>30 min lock), Android may suspend
 *     the JS process. The driver app is intended to be on the dashboard
 *     during a ride, so this trade-off is acceptable.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Request Android background-location permission (needed on Android 10+).
 * Must be called AFTER ACCESS_FINE_LOCATION has already been granted.
 */
export async function requestBackgroundLocation(): Promise<boolean> {
  if (Platform.OS !== 'android') { return true; }

  // Android 10 (API 29)+ requires a separate background location grant
  if (Platform.Version < 29) { return true; }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    {
      title:          'Background Location',
      message:
        'TaxiApp needs to access your location in the background so clients ' +
        'can track your position during a ride, even when you switch apps.',
      buttonPositive: 'Allow always',
      buttonNegative: 'Deny',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Configure Geolocation for background updates and start.
 * Safe to call multiple times — setRNConfiguration is idempotent.
 */
export async function startBackgroundGps(): Promise<void> {
  try {
    // Tell the geolocation lib it should keep delivering coordinates while
    // the app is in the background. The Android implementation honors this
    // along with ACCESS_BACKGROUND_LOCATION (requested above).
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,    // we handle permissions ourselves
      authorizationLevel:     'always', // iOS: needed for background updates
      enableBackgroundLocationUpdates: true,
      locationProvider:       'auto',   // Android: use whatever's available
    });
  } catch {
    /* setRNConfiguration is a no-op on older builds — non-fatal */
  }
}

/**
 * Reset the configuration back to foreground-only when the driver goes offline.
 */
export async function stopBackgroundGps(): Promise<void> {
  try {
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,
      authorizationLevel:     'whenInUse',
      enableBackgroundLocationUpdates: false,
      locationProvider:       'auto',
    });
  } catch {
    /* non-fatal */
  }
}

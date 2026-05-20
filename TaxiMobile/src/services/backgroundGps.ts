/**
 * backgroundGps.ts
 *
 * Background GPS service wrapper.
 *
 * NOTE: react-native-background-actions was removed because it caused a native
 * process crash on React Native 0.84.x (New Architecture / Bridgeless mode).
 * GPS updates still work while the app is in the foreground via MapView's
 * onUserLocationChange + the setInterval in DriverHomeScreen.startGps().
 *
 * TODO: Replace with a New-Architecture-compatible foreground service library
 *       (e.g. @supersami/rn-foreground-service) to restore background GPS.
 *
 * Public API is kept identical so no call sites need to change.
 */

import { Platform, PermissionsAndroid } from 'react-native';

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
 * Start the GPS foreground service.
 * Currently a no-op — see file header for reason.
 */
export async function startBackgroundGps(): Promise<void> {
  // No-op until a RN 0.84-compatible background library is integrated.
}

/**
 * Stop the GPS foreground service.
 * Currently a no-op — see file header for reason.
 */
export async function stopBackgroundGps(): Promise<void> {
  // No-op until a RN 0.84-compatible background library is integrated.
}

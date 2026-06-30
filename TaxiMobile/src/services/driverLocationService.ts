/**
 * driverLocationService.ts
 *
 * Thin JS bridge over the Android LocationForegroundService.
 * No-op on iOS — iOS uses its own background mode declared in Info.plist.
 *
 * The native service:
 *   - shows a persistent "TaxiApp — online" notification while the driver is online
 *   - requests fused location updates every 5s with FOREGROUND_SERVICE_TYPE_LOCATION
 *   - emits each fix as a 'DriverLocationUpdate' event
 *
 * The combination of the persistent notification + active location request is
 * what stops Android from killing the JS process under Doze, so the existing
 * Geolocation.watchPosition() / socket emit keeps working even when the screen
 * is locked or the driver switches apps.
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';

interface LocationServiceNative {
  startService(): Promise<boolean>;
  stopService(): Promise<boolean>;
}

const native: LocationServiceNative | undefined =
  Platform.OS === 'android' ? NativeModules.LocationService : undefined;

const emitter = native ? new NativeEventEmitter(NativeModules.LocationService) : null;

export interface DriverLocationUpdate {
  latitude:  number;
  longitude: number;
  accuracy:  number;
  timestamp: number;
}

export async function startDriverLocationService(): Promise<void> {
  if (!native) return;
  try {
    await native.startService();
  } catch (err) {
    console.warn('[driverLocationService] startService failed:', err);
  }
}

export async function stopDriverLocationService(): Promise<void> {
  if (!native) return;
  try {
    await native.stopService();
  } catch (err) {
    console.warn('[driverLocationService] stopService failed:', err);
  }
}

export function onDriverLocationUpdate(
  handler: (loc: DriverLocationUpdate) => void,
): EmitterSubscription | null {
  if (!emitter) return null;
  return emitter.addListener('DriverLocationUpdate', handler);
}

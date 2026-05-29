/**
 * Firebase Cloud Messaging — fault-tolerant wrapper.
 *
 * All functions are wrapped in try/catch so that a missing or misconfigured
 * google-services.json never crashes the app. FCM degrades gracefully to a
 * no-op when Firebase is unavailable.
 *
 * Setup checklist:
 *  1. Create a Firebase project at console.firebase.google.com
 *  2. Add an Android app (package: com.taximelafert)
 *  3. Download google-services.json → place at android/app/google-services.json
 *  4. Rebuild: npx react-native run-android
 */
import { Platform } from 'react-native';
import apiClient from '../api/client';
import { notificationNavigate } from '../navigation/navigationRef';
import { useSnackbarStore } from '../stores/snackbarStore';

// Lazily resolve the messaging module so a missing native build never
// crashes the JS bundle at import time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMessaging(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/messaging').default;
  } catch {
    return null;
  }
}

// ── Background handler (called from index.js before AppRegistry) ─────────────
export function setupBackgroundHandler(): void {
  try {
    const messaging = getMessaging();
    if (!messaging) return;
    messaging().setBackgroundMessageHandler(async () => {
      // Android shows the notification automatically via the FCM payload.
      // Nothing extra needed here unless you process data-only messages.
    });
  } catch (err) {
    console.warn('[FCM] setupBackgroundHandler failed (Firebase not configured?):', err);
  }
}

// ── Permission ────────────────────────────────────────────────────────────────
async function requestPermission(): Promise<boolean> {
  try {
    const messaging = getMessaging();
    if (!messaging) return false;

    if (Platform.OS === 'ios') {
      const status = await messaging().requestPermission();
      const { AuthorizationStatus } = messaging;
      return (
        status === AuthorizationStatus.AUTHORIZED ||
        status === AuthorizationStatus.PROVISIONAL
      );
    }
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PermissionsAndroid } = require('react-native');
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true; // Android < 13 — granted by manifest
  } catch {
    return false;
  }
}

// ── Token registration ────────────────────────────────────────────────────────
async function sendTokenToServer(token: string | null): Promise<void> {
  try {
    await apiClient.patch('/auth/fcm-token', { fcmToken: token ?? null });
  } catch (err) {
    console.warn('[FCM] Failed to send token to server:', err);
  }
}

export async function registerFcmToken(): Promise<void> {
  try {
    const messaging = getMessaging();
    if (!messaging) {
      console.log('[FCM] Native module not available — skipping token registration');
      return;
    }

    const granted = await requestPermission();
    if (!granted) {
      console.log('[FCM] Notification permission denied');
      return;
    }

    const token: string = await messaging().getToken();
    if (token) {
      await sendTokenToServer(token);
      console.log('[FCM] Token registered successfully');
    }

    // Re-register when Firebase rotates the token
    messaging().onTokenRefresh((newToken: string) => {
      sendTokenToServer(newToken);
    });
  } catch (err) {
    console.warn('[FCM] registerFcmToken error (non-fatal):', err);
  }
}

export async function clearFcmToken(): Promise<void> {
  await sendTokenToServer(null);
}

// ── Foreground handler ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onForegroundMessage(handler: (msg: any) => void): () => void {
  try {
    const messaging = getMessaging();
    if (!messaging) return () => {};
    return messaging().onMessage(handler);
  } catch {
    return () => {};
  }
}

// ── Full setup (call once after the user is authenticated) ────────────────────
/**
 * setupFcm()
 *
 * 1. Requests notification permission
 * 2. Registers the FCM token with the server
 * 3. Shows an Alert for foreground notifications with a "View" action
 * 4. Handles notification taps when the app is in the background
 * 5. Handles the initial notification (app was fully quit)
 *
 * Returns an unsubscribe function — call it on logout / unmount.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTapPayload(remoteMessage: any): { event: string; rideId?: string } | null {
  const data = remoteMessage?.data ?? remoteMessage?.notification?.data ?? {};
  const event = data?.event as string | undefined;
  if (!event) return null;
  return { event, rideId: data?.rideId as string | undefined };
}

export async function setupFcm(): Promise<() => void> {
  const unsubscribers: Array<() => void> = [];

  try {
    const messaging = getMessaging();
    if (!messaging) {
      console.log('[FCM] Native module not available — push notifications disabled');
      return () => {};
    }

    // 1 & 2 — permission + token
    await registerFcmToken();

    // 3 — foreground messages: slide up a bottom Snackbar (tappable).
    // The old Alert.alert dialog was too intrusive — it blocked the screen
    // and required the user to dismiss it. Now we show a non-blocking toast
    // that auto-dismisses and is tappable for the "view" action.
    const unsubForeground = messaging().onMessage(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (remoteMessage: any) => {
        const title: string =
          remoteMessage?.notification?.title ?? 'TaxiApp';
        const body: string =
          remoteMessage?.notification?.body ?? 'You have a new notification.';
        const tap = extractTapPayload(remoteMessage);

        useSnackbarStore.getState().show({
          title,
          body,
          onPress: tap
            ? () => notificationNavigate(tap.event, tap.rideId)
            : undefined,
          durationMs: 5000,
        });
      },
    );
    unsubscribers.push(unsubForeground);

    // 4 — background tap (app was backgrounded, user taps notification)
    const unsubBackground = messaging().onNotificationOpenedApp(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (remoteMessage: any) => {
        const tap = extractTapPayload(remoteMessage);
        if (tap) notificationNavigate(tap.event, tap.rideId);
      },
    );
    unsubscribers.push(unsubBackground);

    // 5 — quit tap (app was fully closed, user taps notification to open)
    const initial = await messaging().getInitialNotification();
    if (initial) {
      const tap = extractTapPayload(initial);
      // Delay slightly so the navigator is mounted and isReady() returns true
      if (tap) {
        setTimeout(() => notificationNavigate(tap.event, tap.rideId), 500);
      }
    }

  } catch (err) {
    console.warn('[FCM] setupFcm error (non-fatal):', err);
  }

  return () => {
    for (const unsub of unsubscribers) {
      try { unsub(); } catch { /* ignore */ }
    }
  };
}

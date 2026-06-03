import React, { useEffect, useState } from 'react';
import { StatusBar, Platform, NativeModules, LogBox, Appearance } from 'react-native';

// ── Suppress known third-party library warnings ────────────────────────────
// @stripe/stripe-react-native 0.65.0 — PaymentMethodMessagingElement uses
// forwardRef but omits the ref parameter. This is a Stripe bug; it does NOT
// affect the PaymentSheet or any feature we use. Suppress until Stripe fixes it.
LogBox.ignoreLogs([
  'forwardRef render functions accept exactly two parameters',
]);
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import ErrorBoundary from './src/components/ErrorBoundary';
import OfflineBanner from './src/components/OfflineBanner';
import SnackbarHost from './src/components/SnackbarHost';
import UpdateModal from './src/components/UpdateModal';
import { startConnectivityMonitor } from './src/services/connectivity';
import { initI18n } from './src/i18n';
import { useThemeStore, useColors } from './src/stores/themeStore';
import { appApi } from './src/api/app';
import { APP_VERSION } from './src/constants/version';
import { isOlderThan } from './src/utils/semver';
import Config from './src/config';
import { configureGoogleAuth } from './src/services/googleAuth';

/**
 * Deep-link URL scheme: taxiapp://
 *
 * Supported paths (used by FCM notification click_action):
 *   taxiapp://ride/request?rideId=<id>       → driver IncomingRequest
 *   taxiapp://ride/active?rideId=<id>        → client ActiveRide
 *   taxiapp://ride/pay?rideId=<id>           → client PayCash
 *   taxiapp://ride/rate?rideId=<id>          → client RateRide
 *
 * The linking config maps these to the correct nested navigator screens.
 */
const linking = {
  prefixes: ['taxiapp://'],
  config: {
    screens: {
      DriverApp: {
        screens: {
          DriverHome: {
            screens: {
              IncomingRequest: 'ride/request',
              ActiveDriverRide: 'driver/ride/active',
            },
          },
        },
      },
      ClientApp: {
        screens: {
          ClientHome: {
            screens: {
              ActiveRide: 'ride/active',
              PayCash:    'ride/pay',
              RateRide:   'ride/rate',
            },
          },
        },
      },
    },
  },
};

type UpdateState =
  | { mode: 'force' | 'soft'; latestVersion: string; storeUrl: string }
  | null;

export default function App(): React.JSX.Element {
  const [updateState, setUpdateState] = useState<UpdateState>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const initTheme        = useThemeStore(s => s.initTheme);
  const _setSystemScheme = useThemeStore(s => s._setSystemScheme);
  const isDark           = useThemeStore(s => {
    const { mode, systemScheme } = s;
    if (mode === 'dark')  return true;
    if (mode === 'light') return false;
    return systemScheme === 'dark';
  });
  const colors = useColors();

  // React Navigation theme — keeps screen card backgrounds and nav chrome
  // in sync with the active colour palette instead of always using the default
  // light theme (which causes a white flash during transitions in dark mode).
  const navTheme = {
    dark: isDark,
    colors: {
      primary:      colors.primary,
      background:   colors.background,
      card:         colors.surface,
      text:         colors.text,
      border:       colors.border,
      notification: colors.error,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium:  { fontFamily: 'System', fontWeight: '500' as const },
      bold:    { fontFamily: 'System', fontWeight: '700' as const },
      heavy:   { fontFamily: 'System', fontWeight: '800' as const },
    },
  };

  useEffect(() => {
    // Switch Android from SplashTheme → AppTheme as soon as JS is running.
    if (Platform.OS === 'android') {
      const { UIManager } = NativeModules;
      try { UIManager?.setAppStyle?.('AppTheme'); } catch { /* no-op */ }
    }
  }, []);

  // Rehydrate persisted theme preference
  useEffect(() => { initTheme(); }, [initTheme]);

  // Configure Google Sign-In once (no-op when GOOGLE_WEB_CLIENT_ID is unset)
  useEffect(() => { configureGoogleAuth(); }, []);

  // Keep the store in sync when the OS colour scheme changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      _setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, [_setSystemScheme]);

  useEffect(() => {
    // Start network monitor — detects offline state via axios interceptor
    // and AppState changes (foreground resume). Returns a cleanup function.
    const stopMonitor = startConnectivityMonitor();
    return stopMonitor;
  }, []);

  useEffect(() => {
    // Restore the user's saved language (or detect from device locale).
    // Fire-and-forget — store starts at 'en' so the brief moment before
    // AsyncStorage resolves is safe.
    initI18n();
  }, []);

  // ── Version check — run once on startup ────────────────────────────────────
  useEffect(() => {
    appApi.getVersion()
      .then(({ data }) => {
        const info = Platform.OS === 'ios' ? data.ios : data.android;
        const { latestVersion, minimumVersion, storeUrl } = info;

        if (isOlderThan(APP_VERSION, minimumVersion)) {
          // Below minimum — forced update, cannot be dismissed
          setUpdateState({ mode: 'force', latestVersion: minimumVersion, storeUrl });
        } else if (isOlderThan(APP_VERSION, latestVersion)) {
          // Below latest but above minimum — soft prompt
          setUpdateState({ mode: 'soft', latestVersion, storeUrl });
        }
      })
      .catch(() => {
        // Network failure or server unreachable — silently ignore.
        // The user should not be blocked from using the app when the
        // version endpoint is temporarily unavailable.
      });
  }, []);

  return (
    <ErrorBoundary>
      <StripeProvider publishableKey={Config.STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.taxiapp">
      <SafeAreaProvider>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={isDark ? '#111827' : '#ffffff'}
        />
        <NavigationContainer ref={navigationRef} linking={linking} theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
        {/* Offline banner — rendered above all screens, inside SafeAreaProvider
            so useSafeAreaInsets() works correctly inside the component */}
        <OfflineBanner />

        {/* Bottom snackbar — replaces intrusive Alert.alert() for foreground
            FCM notifications. Auto-dismisses, tappable for "view" action. */}
        <SnackbarHost />

        {/* Version update modal — rendered on top of everything */}
        {updateState && !updateDismissed && (
          <UpdateModal
            visible
            mode={updateState.mode}
            latestVersion={updateState.latestVersion}
            storeUrl={updateState.storeUrl}
            onDismiss={() => setUpdateDismissed(true)}
          />
        )}
      </SafeAreaProvider>
      </StripeProvider>
    </ErrorBoundary>
  );
}

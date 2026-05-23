/**
 * App configuration — driven by react-native-config + .env files.
 *
 * .env                → Android emulator / default dev
 * .env.ios            → iOS simulator
 * .env.production     → production build (set via --env flag or CI)
 *
 * Setup (run once after cloning):
 *   npm install react-native-config
 *   cd android && ./gradlew clean        # Android
 *   cd ios && pod install && cd ..       # iOS
 *
 * The require() is wrapped in try/catch so the app still works during
 * development before the native module is linked.
 *
 * NOTE: react-native-config's TurboModule can return null on some RN versions
 * (newArchEnabled=true). The fallbacks below use __DEV__ so that release
 * builds always point at the production Railway API even if the native module
 * fails to load.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RNConfig: Record<string, string> = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-config');
  // Handle both ESM default export and direct CJS export
  RNConfig = (mod?.default ?? mod) as Record<string, string> ?? {};
} catch {
  // react-native-config TurboModule unavailable — production fallbacks apply below
}

// Production base URL — update this whenever the Railway service URL changes.
const PROD_API_URL = 'https://taximeiafert-production.up.railway.app';

const Config = {
  // If react-native-config fails in a release build, fall back to the
  // hardcoded Railway URL instead of the emulator-only 10.0.2.2 address.
  API_BASE_URL:           RNConfig.API_BASE_URL           || (__DEV__ ? 'http://10.0.2.2:3000' : PROD_API_URL),
  WS_URL:                 RNConfig.WS_URL                 || (__DEV__ ? 'http://10.0.2.2:3000' : PROD_API_URL),
  GOOGLE_MAPS_API_KEY:    RNConfig.GOOGLE_MAPS_API_KEY    ?? '',
  // Stripe publishable key — use pk_test_... in dev, pk_live_... in production
  STRIPE_PUBLISHABLE_KEY: RNConfig.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
};

export default Config;

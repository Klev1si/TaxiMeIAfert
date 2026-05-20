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
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RNConfig: Record<string, string> = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNConfig = require('react-native-config').default ?? {};
} catch {
  // react-native-config not yet linked — use hardcoded dev defaults below
}

const Config = {
  API_BASE_URL:             RNConfig.API_BASE_URL             ?? 'http://10.0.2.2:3000',
  WS_URL:                   RNConfig.WS_URL                   ?? 'http://10.0.2.2:3000',
  GOOGLE_MAPS_API_KEY:      RNConfig.GOOGLE_MAPS_API_KEY      ?? '',
  // Stripe publishable key — use pk_test_... in dev, pk_live_... in production
  STRIPE_PUBLISHABLE_KEY:   RNConfig.STRIPE_PUBLISHABLE_KEY   ?? 'pk_test_placeholder',
};

export default Config;

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
  // NOTE: This key is already baked into the AndroidManifest so it is not secret.
  // The hardcoded fallback ensures fetchRoute() works even when TurboModule fails.
  GOOGLE_MAPS_API_KEY:    RNConfig.GOOGLE_MAPS_API_KEY    || 'AIzaSyAYBI5oVv2TnqtysGBsIbWx4kvupAEiGEE',
  // Google Sign-In Web Client ID. NOTE: like Stripe publishable keys, OAuth
  // Web Client IDs are designed to be public — they ship in every browser
  // app using Google Sign-In. So it's safe to hardcode the fallback here,
  // and necessary because react-native-config's TurboModule returns null
  // on RN 0.84 + newArchEnabled (same problem as STRIPE_PUBLISHABLE_KEY).
  // To rotate: update Firebase project AND edit this fallback together.
  GOOGLE_WEB_CLIENT_ID:
    RNConfig.GOOGLE_WEB_CLIENT_ID ||
    '524747770284-us3dtn3h42qa0uqmip8rbheq0onb9cfd.apps.googleusercontent.com',

  // Stripe publishable key. NOTE: publishable keys are designed to be public
  // — they're meant to ship in client apps — so it's safe to hardcode the
  // fallback here. This guarantees card payments still work when
  // react-native-config's TurboModule returns null on new-arch builds
  // (a known issue on RN 0.84+).
  // To rotate the key: edit .env.production AND this fallback together.
  STRIPE_PUBLISHABLE_KEY:
    RNConfig.STRIPE_PUBLISHABLE_KEY ||
    'pk_test_51TD8FnFdD8fQdLzYRH2eEOEbamUEnDjenO87G9yvoKsD0PZWPGqOpLtI8uPv53tBiShe5lDYCiex2UwhG86hDY3R00DyLwlzZj',
};

/**
 * True when the Stripe publishable key looks real (right prefix + reasonable
 * length). When false, the PayCash screen hides the "Pay with Card" option
 * and shows a friendly note instead of a cryptic "Invalid API Key" Stripe
 * error. Update .env.production with a real key from
 * Stripe Dashboard → Developers → API keys to enable card payments.
 */
/** Google Sign-In can only work once the Web Client ID is set. */
export const isGoogleConfigured: boolean = !!Config.GOOGLE_WEB_CLIENT_ID && Config.GOOGLE_WEB_CLIENT_ID.length > 30;

/**
 * Master switch — when false, every card-payment UI in the app is hidden
 * (Pay by card on PayCash, Manage Cards in the profile, Add card button
 * on the ManageCards screen). Cash payments work normally.
 *
 * Currently false because Stripe doesn't operate in Kosovo, so the
 * platform can't actually accept card payments yet. Flip this back to
 * true the moment you have a working payment processor (Stripe Atlas /
 * a Kosovo bank gateway / Estonia OÜ) — no schema or backend changes
 * needed, the existing code paths still work.
 */
export const cardPaymentsEnabled: boolean = false;

export const isStripeConfigured: boolean = (() => {
  const key = Config.STRIPE_PUBLISHABLE_KEY;
  if (!key) return false;
  if (!key.startsWith('pk_test_') && !key.startsWith('pk_live_')) return false;
  // Placeholders we ship in the repo: pk_test_placeholder, pk_live_YOUR_…
  if (key.includes('placeholder')) return false;
  if (key.includes('YOUR_')) return false;
  if (key.length < 40) return false; // real Stripe keys are ~100+ chars
  return true;
})();

export default Config;

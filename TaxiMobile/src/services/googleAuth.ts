/**
 * Google Sign-In wrapper.
 *
 * One-time setup before this can work:
 *   1. Firebase Console → Authentication → Sign-in method → Google → enable
 *   2. Project Settings → Web SDK config → grab the Web Client ID
 *      (NOT the Android client id — the SDK needs the Web one)
 *   3. Set GOOGLE_WEB_CLIENT_ID in TaxiMobile/.env.production
 *   4. Set the same value on Railway as GOOGLE_WEB_CLIENT_ID
 *   5. Generate the SHA-1 of your release keystore and add it under
 *      Firebase → Project Settings → Android app → Add fingerprint
 *
 * Usage:
 *   await configureGoogleAuth();   // once at app start
 *   const idToken = await signInWithGoogle();
 *   if (idToken) await authApi.googleSignIn(idToken);
 */
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Config from '../config';

let configured = false;

export function configureGoogleAuth() {
  if (configured) return;
  // Web Client ID is correct here — the Android SDK uses it to request an
  // ID token that our backend can verify. The Android client id is set
  // automatically via google-services.json.
  GoogleSignin.configure({
    webClientId: Config.GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

/** Result returned by signInWithGoogle. */
export type GoogleSignInOutcome =
  | { kind: 'idToken'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'in_progress' }
  | { kind: 'play_services_unavailable' }
  | { kind: 'error'; message: string };

/**
 * Open the Google account picker and return an ID token on success.
 * Never throws — always resolves with a discriminated outcome so the UI
 * can render a nice message for each case.
 */
export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  try {
    configureGoogleAuth();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    // Both modular (res.data.idToken) and legacy (res.idToken) shapes covered.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idToken: string | null = (res as any)?.data?.idToken ?? (res as any)?.idToken ?? null;
    if (!idToken) return { kind: 'error', message: 'Google did not return an ID token.' };
    return { kind: 'idToken', idToken };
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (err as any)?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED)         return { kind: 'cancelled' };
    if (code === statusCodes.IN_PROGRESS)               return { kind: 'in_progress' };
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { kind: 'play_services_unavailable' };
    const message = (err as { message?: string })?.message ?? 'Could not sign in with Google.';
    return { kind: 'error', message };
  }
}

/** Signs the user out from Google so the next sign-in shows the picker again. */
export async function signOutFromGoogle() {
  try {
    if (configured) await GoogleSignin.signOut();
  } catch { /* best-effort */ }
}

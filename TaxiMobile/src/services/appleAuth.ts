/**
 * Sign in with Apple wrapper (iOS only).
 *
 * Android currently shows a different non-Apple "Sign in with Apple via Web"
 * flow — we intentionally skip that to keep the surface small. Buttons that
 * call this should be hidden on Android.
 *
 * One-time setup before this can work (after Apple Developer account is live):
 *   1. Apple Developer → Identifiers → App IDs → enable "Sign in with Apple"
 *      capability on com.taximelafert
 *   2. Xcode (or Expo prebuild) → Signing & Capabilities → add "Sign in with
 *      Apple" capability for the iOS target
 *   3. Set APPLE_BUNDLE_ID=com.taximelafert on Railway so the backend can
 *      verify the identity token audience
 *
 * Usage:
 *   const out = await signInWithApple();
 *   if (out.kind === 'identityToken') {
 *     await authApi.appleSignIn(out.identityToken, out.firstName, out.lastName);
 *   }
 */
import { Platform } from 'react-native';

export type AppleSignInOutcome =
  | { kind: 'identityToken'; identityToken: string; firstName?: string; lastName?: string }
  | { kind: 'cancelled' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export async function signInWithApple(): Promise<AppleSignInOutcome> {
  if (Platform.OS !== 'ios') {
    return { kind: 'unsupported' };
  }

  // Lazy-require so Android bundles don't pull the native module in.
  // NOTE (v2.x API): the package exports only { default: appleAuth, appleAuth,
  // AppleButton, appleAuthAndroid }. The Operation/Scope/Error constants are
  // properties ON the appleAuth instance (appleAuth.Operation.LOGIN etc.) —
  // there are no AppleRequestOperation/AppleRequestScope/AppleError exports.
  let appleAuth: typeof import('@invertase/react-native-apple-authentication').appleAuth;
  try {
    const mod = require('@invertase/react-native-apple-authentication');
    appleAuth = mod.appleAuth ?? mod.default;
    if (!appleAuth?.isSupported) {
      return { kind: 'unsupported' };
    }
  } catch {
    return { kind: 'unsupported' };
  }

  try {
    const res = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes:    [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });

    const identityToken = res.identityToken;
    if (!identityToken) {
      return { kind: 'error', message: 'Apple did not return an identity token.' };
    }

    return {
      kind:          'identityToken',
      identityToken,
      firstName:     res.fullName?.givenName  ?? undefined,
      lastName:      res.fullName?.familyName ?? undefined,
    };
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (err as any)?.code;
    if (code === appleAuth.Error.CANCELED) return { kind: 'cancelled' };
    const message = (err as { message?: string })?.message ?? 'Could not sign in with Apple.';
    return { kind: 'error', message };
  }
}

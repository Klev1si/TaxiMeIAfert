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
  let appleAuth: typeof import('@invertase/react-native-apple-authentication').default;
  let AppleError: typeof import('@invertase/react-native-apple-authentication').AppleError;
  let AppleRequestScope: typeof import('@invertase/react-native-apple-authentication').AppleRequestScope;
  let AppleRequestOperation: typeof import('@invertase/react-native-apple-authentication').AppleRequestOperation;
  try {
    const mod = require('@invertase/react-native-apple-authentication');
    appleAuth = mod.default;
    AppleError = mod.AppleError;
    AppleRequestScope = mod.AppleRequestScope;
    AppleRequestOperation = mod.AppleRequestOperation;
  } catch {
    return { kind: 'unsupported' };
  }

  if (!appleAuth.isSupported) {
    return { kind: 'unsupported' };
  }

  try {
    const res = await appleAuth.performRequest({
      requestedOperation: AppleRequestOperation.LOGIN,
      requestedScopes:    [AppleRequestScope.EMAIL, AppleRequestScope.FULL_NAME],
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
    if (code === AppleError.CANCELED) return { kind: 'cancelled' };
    const message = (err as { message?: string })?.message ?? 'Could not sign in with Apple.';
    return { kind: 'error', message };
  }
}

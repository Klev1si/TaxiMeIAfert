/**
 * tokenStorage — secure token persistence backed by react-native-keychain.
 *
 * Why not AsyncStorage?
 *   AsyncStorage is plain-text on Android (SharedPreferences) and unencrypted
 *   on iOS. A rooted/jailbroken device can read those values.
 *
 * react-native-keychain uses:
 *   • Android Keystore  — hardware-backed encryption, survives reinstalls
 *   • iOS Keychain      — Secure Enclave, protected by device passcode/biometrics
 *
 * Performance:
 *   An in-memory cache ensures we only hit the Keychain once per session.
 *   All subsequent reads (e.g. every API request) use the cached value.
 *   The cache is wiped on clearTokens() (logout).
 */

import * as Keychain from 'react-native-keychain';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Keychain service name — scopes storage to this app's auth tokens */
const SERVICE  = 'com.taximelafert.auth';

/** Keychain requires a "username" field; we use a fixed label */
const USERNAME = 'tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tokens {
  accessToken:  string;
  refreshToken: string;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let _cache: Tokens | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

export const tokenStorage = {
  /**
   * Read both tokens.
   * Returns from cache when available; falls back to a Keychain read.
   */
  async getAll(): Promise<Tokens | null> {
    if (_cache) return _cache;
    try {
      const creds = await Keychain.getGenericPassword({ service: SERVICE });
      if (!creds) return null;
      _cache = JSON.parse(creds.password) as Tokens;
      return _cache;
    } catch {
      return null;
    }
  },

  /** Read the access token only */
  async getAccessToken(): Promise<string | null> {
    return (await this.getAll())?.accessToken ?? null;
  },

  /** Read the refresh token only */
  async getRefreshToken(): Promise<string | null> {
    return (await this.getAll())?.refreshToken ?? null;
  },

  /**
   * Persist both tokens to the Keychain and update the in-memory cache.
   * WHEN_UNLOCKED_THIS_DEVICE_ONLY: tokens are readable only while the device
   * is unlocked and are NOT backed up to iCloud / adb backup.
   */
  async set(accessToken: string, refreshToken: string): Promise<void> {
    const tokens: Tokens = { accessToken, refreshToken };
    _cache = tokens;
    await Keychain.setGenericPassword(USERNAME, JSON.stringify(tokens), {
      service:    SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  /**
   * Wipe tokens from Keychain and clear the in-memory cache.
   * Call this on logout.
   */
  async clear(): Promise<void> {
    _cache = null;
    try {
      await Keychain.resetGenericPassword({ service: SERVICE });
    } catch {
      // Already cleared or never set — safe to ignore
    }
  },
};

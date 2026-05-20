/**
 * Connectivity monitor — zero native-module dependency.
 *
 * Strategy:
 *  1. Axios interceptor calls `notifyNetworkError()` on any network-level failure.
 *     This immediately marks the app as offline and starts a poll loop.
 *  2. Every 5 seconds the poll loop sends a HEAD request to the API base URL.
 *     When it succeeds the app is marked online again and polling stops.
 *  3. AppState listener re-checks when the app returns to the foreground —
 *     catches the case where the user lost and regained connectivity while
 *     the app was backgrounded.
 *
 * Call `startConnectivityMonitor()` once on app mount (see App.tsx).
 * Call `notifyNetworkError()` from the axios response interceptor.
 */

import { AppState, AppStateStatus } from 'react-native';
import Config from '../config';
import { useNetworkStore } from '../stores/networkStore';

// HEAD request target — the API root always responds with *something*
const PING_URL = Config.API_BASE_URL.replace(/\/$/, '') + '/';
const POLL_MS  = 5_000;   // how often to retry while offline
const TIMEOUT  = 4_000;   // max wait per ping

// ── Internal state ────────────────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fire a single HEAD request.
 * Returns true if we got any HTTP response (even 4xx) — that means the
 * network layer is working. Only rejects (network-level error) → false.
 */
async function ping(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(PING_URL, {
      method: 'HEAD',
      signal: controller.signal,
      // 'cache' is not supported in React Native's fetch — add cache-busting via URL instead
      headers: { 'Cache-Control': 'no-store' },
    });
    clearTimeout(id);
    // Any HTTP status means we got through the network
    return res.status < 600;
  } catch {
    return false;
  }
}

function startPolling() {
  if (pollTimer !== null) return; // already running
  pollTimer = setInterval(async () => {
    const online = await ping();
    if (online) {
      useNetworkStore.getState().setOnline(true);
      stopPolling();
    }
  }, POLL_MS);
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called by the axios response interceptor whenever a network-level error
 * occurs (no response received — i.e. ERR_NETWORK, timeout, etc.).
 */
export function notifyNetworkError() {
  useNetworkStore.getState().setOnline(false);
  startPolling();
}

/**
 * Called once in App.tsx on mount.
 * Returns a cleanup function to call on unmount.
 */
export function startConnectivityMonitor(): () => void {
  appStateSub = AppState.addEventListener(
    'change',
    async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;

      // App just came back to the foreground — verify connectivity
      const online = await ping();
      const wasOffline = !useNetworkStore.getState().isOnline;

      useNetworkStore.getState().setOnline(online);

      if (!online) {
        // Still down — make sure the poll loop is running
        startPolling();
      } else if (wasOffline) {
        // Recovered while in background — stop any running poll
        stopPolling();
      }
    },
  );

  return () => {
    stopPolling();
    appStateSub?.remove();
    appStateSub = null;
  };
}

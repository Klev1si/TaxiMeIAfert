import { io, Socket } from 'socket.io-client';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import Config from '../config';
import { tokenStorage } from '../utils/tokenStorage';
import { refreshAccessToken } from '../api/client';

type Handler = (...args: unknown[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private appStateSub: NativeEventSubscription | null = null;

  // Desired driver-online state. The server drops the driver from its geo index
  // on every socket disconnect (Android Doze kills the socket constantly), and
  // it only re-adds them when it receives `driver_online`. Socket.io fires
  // 'connect' on every (re)connect — we re-emit `driver_online` there so the
  // driver never silently falls offline until an app restart.
  private driverOnline = false;

  // App-level "re-sync your state now" hooks, invoked on every (re)connect.
  // Used by screens (e.g. ActiveRideScreen) to re-fetch authoritative state
  // after a reconnect, since socket.io does NOT replay events missed while the
  // socket was down.
  private reconnectHandlers = new Set<() => void>();

  // Every handler registered through on(), kept independently of the socket
  // instance. connect() builds a NEW socket (login, app start), and listeners
  // attached to the old instance would otherwise be silently lost — screens
  // would keep showing a stale ride status because they no longer hear
  // ride_completed / payment_confirmed.
  private listeners = new Map<string, Set<Handler>>();

  // Guards the "token expired → refresh → reconnect" loop.
  private refreshingAuth = false;

  /** Connect (or reconnect) with a fresh access token */
  connect(accessToken: string): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    this.socket = io(Config.WS_URL, {
      // Read the CURRENT access token on every (re)connect attempt. A fixed
      // token expires after 15 minutes; from then on every reconnect was
      // rejected with "Unauthorized" and — because socket.io never auto-retries
      // a handshake rejected by server middleware — the socket stayed dead for
      // the rest of the session. The client then never heard ride_completed /
      // payment_confirmed and sat on a stale status.
      auth: (cb) => {
        tokenStorage.getAccessToken()
          .then((token) => cb({ token: token ?? accessToken }))
          .catch(() => cb({ token: accessToken }));
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay:    3_000,   // wait 3 s before first retry
      reconnectionDelayMax: 30_000,  // cap backoff at 30 s — prevents radio hammering
    });

    // Re-attach every handler screens registered (possibly on a previous socket).
    this.listeners.forEach((set, event) => {
      set.forEach((h) => this.socket?.on(event, h));
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);

      // Re-establish driver-online state after any (re)connect. Without this the
      // driver's toggle shows "online" but the server no longer has them in the
      // geo index, so they get no ride requests until they restart the app.
      if (this.driverOnline) {
        console.log('[Socket] Re-emitting driver_online after (re)connect');
        this.socket?.emit('driver_online');
      }

      // Let screens re-sync any state they may have missed while disconnected
      // (e.g. a ride that was accepted/completed during the outage).
      this.resync();
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] connect_error:', err.message);
      // The server's auth middleware rejected the handshake (expired token).
      // socket.io will NOT retry this on its own — refresh and reconnect.
      if (!this.socket?.active && /unauthori[sz]ed|token/i.test(err.message)) {
        void this.refreshAndReconnect();
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    // Android suspends/throttles background timers (Doze / App Standby) far more
    // aggressively than iOS, so socket.io's own backoff timer often never fires
    // while the app is backgrounded — the socket comes back to the foreground
    // still disconnected and just sits there until the next manual action.
    // Force an immediate reconnect attempt whenever the app becomes active.
    this.appStateSub?.remove();
    this.appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') { this.ensureConnected(); }
    });
  }

  /** Force a reconnect attempt if the socket is down (no-op when connected). */
  ensureConnected(): void {
    if (this.socket && !this.socket.connected) {
      console.log('[Socket] Not connected — forcing reconnect');
      this.socket.connect();
    }
  }

  /**
   * Ask every registered screen to re-fetch authoritative state now. Called on
   * every (re)connect, and also when a push notification arrives in the
   * foreground — a push proves the server changed something we might have
   * missed on the socket.
   */
  resync(): void {
    this.reconnectHandlers.forEach((cb) => {
      try { cb(); } catch (err) { console.warn('[Socket] resync handler failed:', err); }
    });
  }

  private async refreshAndReconnect(): Promise<void> {
    if (this.refreshingAuth) { return; }
    this.refreshingAuth = true;
    try {
      await refreshAccessToken();
      // auth() reads the fresh token from storage on this attempt.
      this.socket?.connect();
    } catch (err) {
      console.warn('[Socket] token refresh for reconnect failed:', err);
      // Network may be down — try again in a bit while the session lives.
      setTimeout(() => {
        if (this.socket && !this.socket.connected) { void this.refreshAndReconnect(); }
      }, 15_000);
    } finally {
      this.refreshingAuth = false;
    }
  }

  /** Gracefully disconnect */
  disconnect(): void {
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.driverOnline = false;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  /**
   * Register a callback to run on every (re)connect — use it to re-fetch
   * authoritative state after the socket recovers. Returns an unsubscribe fn.
   */
  onReconnect(cb: () => void): () => void {
    this.reconnectHandlers.add(cb);
    return () => { this.reconnectHandlers.delete(cb); };
  }

  /** Whether the socket is currently connected */
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Emit an event to the server */
  emit<T = unknown>(event: string, data?: T): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] emit() called while not connected');
      return;
    }
    this.socket.emit(event, data);
  }

  /** Subscribe to an inbound server event. Returns an unsubscribe function.
   *  The subscription survives socket re-creation (login / app restart). */
  on<T = unknown>(event: string, handler: (data: T) => void): () => void {
    const h = handler as Handler;
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(h);
    this.socket?.on(event, h);
    return () => {
      this.listeners.get(event)?.delete(h);
      this.socket?.off(event, h);
    };
  }

  /** Remove all listeners for an event */
  off(event: string): void {
    this.listeners.delete(event);
    this.socket?.off(event);
  }

  /** Send a GPS update (driver only). `accuracy` (metres) and `mocked`
   *  (Android mock-location flag) let the server keep bad or fake fixes out
   *  of the ride's billed distance. */
  sendGpsUpdate(lat: number, lng: number, accuracy?: number | null, mocked?: boolean): void {
    this.emit('gps_update', { lat, lng, accuracy: accuracy ?? null, mocked: !!mocked });
  }

  /** Signal the server that driver is now online and accepting rides */
  goOnline(): void {
    // Remember the intent so we can re-assert it on every reconnect, even if
    // the socket is momentarily disconnected right now (emit would be dropped).
    this.driverOnline = true;
    this.emit('driver_online');
  }

  /** Signal the server that driver is going offline (removes from geo index) */
  goOffline(): void {
    this.driverOnline = false;
    this.emit('driver_offline');
  }
}

// Export a single app-wide instance
export const socketService = new SocketService();

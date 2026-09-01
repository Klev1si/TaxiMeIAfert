import { io, Socket } from 'socket.io-client';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import Config from '../config';

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

  /** Connect (or reconnect) with a fresh access token */
  connect(accessToken: string): void {
    if (this.socket?.connected) {
      this.socket.disconnect();
    }

    this.socket = io(Config.WS_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay:    3_000,   // wait 3 s before first retry
      reconnectionDelayMax: 30_000,  // cap backoff at 30 s — prevents radio hammering
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
      this.reconnectHandlers.forEach((cb) => {
        try { cb(); } catch (err) { console.warn('[Socket] reconnect handler failed:', err); }
      });
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] connect_error:', err.message);
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
      if (state === 'active' && this.socket && !this.socket.connected) {
        console.log('[Socket] App foregrounded while disconnected — forcing reconnect');
        this.socket.connect();
      }
    });
  }

  /** Gracefully disconnect */
  disconnect(): void {
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.driverOnline = false;
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

  /** Subscribe to an inbound server event. Returns an unsubscribe function. */
  on<T = unknown>(event: string, handler: (data: T) => void): () => void {
    this.socket?.on(event, handler as (...args: unknown[]) => void);
    return () => this.socket?.off(event, handler as (...args: unknown[]) => void);
  }

  /** Remove all listeners for an event */
  off(event: string): void {
    this.socket?.off(event);
  }

  /** Send a GPS update (driver only) */
  sendGpsUpdate(lat: number, lng: number): void {
    this.emit('gps_update', { lat, lng });
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

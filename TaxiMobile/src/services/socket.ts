import { io, Socket } from 'socket.io-client';
import Config from '../config';

class SocketService {
  private socket: Socket | null = null;

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
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] connect_error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });
  }

  /** Gracefully disconnect */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
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
}

// Export a single app-wide instance
export const socketService = new SocketService();

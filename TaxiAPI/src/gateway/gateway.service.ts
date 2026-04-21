import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * GatewayService is the single place where the rest of the application
 * (rides, GPS, notifications) can push Socket.io events to specific users.
 *
 * Usage:
 *   this.gatewayService.emitToUser(driverId, 'ride_request', payload);
 *   this.gatewayService.emitToRoom('driver:abc', 'location_ack', {});
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  // Injected by EventsGateway after it initialises
  private server: Server;

  setServer(server: Server): void {
    this.server = server;
  }

  /** Emit an event to all sockets in a user's private room */
  emitToUser(userId: string, event: string, data: unknown): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, data);
    this.logger.debug(`emit → user:${userId}  event: ${event}`);
  }

  /** Emit to an arbitrary room (e.g. 'driver:online', 'company:xyz') */
  emitToRoom(room: string, event: string, data: unknown): void {
    if (!this.server) return;
    this.server.to(room).emit(event, data);
    this.logger.debug(`emit → room:${room}  event: ${event}`);
  }

  /** Broadcast to every connected socket */
  broadcast(event: string, data: unknown): void {
    if (!this.server) return;
    this.server.emit(event, data);
  }
}

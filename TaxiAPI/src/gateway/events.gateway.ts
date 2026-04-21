import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { GatewayService } from './gateway.service.js';
import { JwtPayload } from '../auth/strategies/jwt.strategy.js';

/** Shape stored on socket.data after authentication */
export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    phone: string;
    role: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*', // tightened by CORS_ORIGIN env in production
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly gatewayService: GatewayService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  afterInit(server: Server): void {
    this.gatewayService.setServer(server);

    /**
     * Socket.io middleware runs BEFORE handleConnection.
     * Rejecting here causes a `connect_error` on the client side —
     * the socket never establishes, which is the correct behaviour.
     */
    server.use((socket, next) => {
      try {
        const payload = this.extractAndVerifyToken(socket);
        // Store identity so handleConnection and event handlers can read it
        socket.data = {
          userId: payload.sub,
          phone: payload.phone,
          role: payload.role,
        };
        next();
      } catch {
        next(new Error('Unauthorized — invalid or missing token'));
      }
    });

    this.logger.log('WebSocket gateway initialised');
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    // Identity already validated & stored by the middleware above
    const { userId, role } = client.data;

    // Each user gets a private room — use this to target them later
    await client.join(`user:${userId}`);

    // Drivers also join the shared online-drivers room
    if (role === 'driver') {
      await client.join('drivers:online');
    }

    this.logger.log(`[connect] ${role} ${userId} (socketId: ${client.id})`);
  }

  handleDisconnect(client: Socket): void {
    const data = (client as AuthenticatedSocket).data;
    if (data?.userId) {
      this.logger.log(
        `[disconnect] ${data.role} ${data.userId} (socketId: ${client.id})`,
      );
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /**
   * ping → pong health-check.
   * Client emits:  socket.emit('ping')
   * Server replies: socket.on('pong', ({ timestamp }) => ...)
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket): void {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  /**
   * join_room — join a named room explicitly.
   * Client emits:  socket.emit('join_room', { room: 'company:uuid' })
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!body?.room) throw new WsException('room is required');
    await client.join(body.room);
    client.emit('room_joined', { room: body.room });
    this.logger.debug(`${client.data.userId} joined room: ${body.room}`);
  }

  /**
   * leave_room — leave a named room.
   * Client emits:  socket.emit('leave_room', { room: 'company:uuid' })
   */
  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!body?.room) throw new WsException('room is required');
    await client.leave(body.room);
    client.emit('room_left', { room: body.room });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private extractAndVerifyToken(client: Socket): JwtPayload {
    // Token accepted in: handshake.auth.token  OR  Authorization header
    const raw: string =
      (client.handshake.auth as Record<string, string>)?.token ??
      (client.handshake.headers.authorization as string) ??
      '';

    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;

    if (!token) throw new WsException('No token provided');

    return this.jwtService.verify<JwtPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
    });
  }
}

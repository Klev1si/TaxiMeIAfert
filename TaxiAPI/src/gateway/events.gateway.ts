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
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { GatewayService } from './gateway.service.js';
import { WsAuthGuard } from './ws-auth.guard.js';
import { GpsService } from '../gps/gps.service.js';
import { JwtPayload } from '../auth/strategies/jwt.strategy.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';

/** Extended socket.data — set by middleware + handleConnection */
export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    phone: string;
    role: string;
    // Populated for role === 'driver'
    driverId?: string;
    companyId?: string | null;
  };
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
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
    private readonly gpsService: GpsService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  afterInit(server: Server): void {
    this.gatewayService.setServer(server);

    // Auth middleware — runs BEFORE handleConnection.
    // Invalid tokens → connect_error (socket never reaches the app layer).
    server.use((socket, next) => {
      try {
        const payload = this.extractAndVerifyToken(socket);
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
    const { userId, role } = client.data;

    // Private room — used to target this user from any service
    await client.join(`user:${userId}`);

    if (role === 'driver') {
      // Load driver record to get driverId + companyId
      const driverRecord = await this.gpsService.getDriverByUserId(userId);
      if (driverRecord) {
        client.data.driverId = driverRecord.id;
        client.data.companyId = driverRecord.companyId;

        // Join the shared online-drivers room
        await client.join('drivers:online');

        // Join company-specific room so dashboard sees this driver's updates
        if (driverRecord.companyId) {
          await client.join(`company:${driverRecord.companyId}`);
        }
      }
    }

    this.logger.log(`[connect] ${role} ${userId} (socket: ${client.id})`);
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const { userId, role, driverId } = client.data ?? {};

    if (role === 'driver' && driverId) {
      // Remove driver from geo index so they no longer appear in GEOSEARCH
      await this.gpsService.removeFromGeo(driverId);
    }

    if (userId) {
      this.logger.log(`[disconnect] ${role} ${userId} (socket: ${client.id})`);
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /** ping → pong — connection health-check */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket): void {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  /** join_room — join a named room (e.g. a company room) */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!body?.room) throw new WsException('room is required');
    await client.join(body.room);
    client.emit('room_joined', { room: body.room });
  }

  /** leave_room — leave a named room */
  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!body?.room) throw new WsException('room is required');
    await client.leave(body.room);
    client.emit('room_left', { room: body.room });
  }

  /**
   * gps_update — driver broadcasts current coordinates.
   *
   * Expected every ~3 seconds from the mobile app.
   * Only approved drivers may call this event.
   *
   * Client emits:
   *   socket.emit('gps_update', { lat: 40.1872, lng: 44.5152 })
   *
   * Server responds (to driver only):
   *   socket.on('gps_ack', { lat, lng, ts })
   *
   * Server broadcasts (to company room):
   *   'driver_location' → { driverId, lat, lng, ts }
   */
  @UseGuards(WsAuthGuard)
  @Roles(UserRole.DRIVER)
  @SubscribeMessage('gps_update')
  async handleGpsUpdate(
    @MessageBody() body: { lat: number; lng: number },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    // Guard against the race condition where gps_update arrives before
    // handleConnection's async DB lookup has finished populating driverId.
    if (!client.data.driverId) {
      const rec = await this.gpsService.getDriverByUserId(client.data.userId);
      if (rec) {
        client.data.driverId = rec.id;
        client.data.companyId = rec.companyId;
      }
    }

    const { driverId, companyId } = client.data;

    if (!driverId) {
      throw new WsException('Driver profile not found');
    }

    // Basic coordinate validation
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (
      !isFinite(lat) || lat < -90  || lat > 90 ||
      !isFinite(lng) || lng < -180 || lng > 180
    ) {
      throw new WsException('Invalid coordinates — lat ∈ [-90,90], lng ∈ [-180,180]');
    }

    // Persist to Redis GEO index + throttled DB update
    await this.gpsService.updateLocation(driverId, lat, lng);

    const ts = Date.now();

    // ACK back to the driver
    client.emit('gps_ack', { lat, lng, ts });

    // Broadcast to company dashboard room
    if (companyId) {
      this.gatewayService.emitToRoom(`company:${companyId}`, 'driver_location', {
        driverId,
        lat,
        lng,
        ts,
      });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private extractAndVerifyToken(client: Socket): JwtPayload {
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

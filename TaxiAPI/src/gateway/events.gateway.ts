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
import { Inject, Logger, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import type Redis from 'ioredis';
import { GatewayService } from './gateway.service.js';
import { WsAuthGuard } from './ws-auth.guard.js';
import { GpsService } from '../gps/gps.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { JwtPayload } from '../auth/strategies/jwt.strategy.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { User } from '../entities/index.js';

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

// WebSocket connections bypass the HTTP ThrottlerGuard automatically.
// @SkipThrottle makes that intent explicit and future-proof.
@SkipThrottle()
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
    private readonly notificationsService: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
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

    // Relay live location + ETA to the client of the driver's active ride (if any)
    const clientUserId = await this.redis.get(`driver:active_client:${driverId}`);
    if (clientUserId) {
      // Calculate ETA to pickup (straight-line Haversine / 25 km/h avg city speed)
      let etaMinutes: number | null = null;
      const pickupRaw = await this.redis.get(`driver:pickup_coords:${driverId}`);
      if (pickupRaw) {
        try {
          const { lat: pLat, lng: pLng } = JSON.parse(pickupRaw) as { lat: number; lng: number };
          const R = 6371;
          const dLat = ((pLat - lat) * Math.PI) / 180;
          const dLng = ((pLng - lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat  * Math.PI) / 180) *
            Math.cos((pLat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
          const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          etaMinutes = Math.max(1, Math.round((distKm / 25) * 60)); // min 1 min
        } catch { /* ignore parse errors */ }
      }

      this.gatewayService.emitToRoom(`user:${clientUserId}`, 'driver_location_update', {
        driverId,
        lat,
        lng,
        ts,
        etaMinutes,
      });
    }
  }

  /**
   * driver_online — driver signals they are now online and accepting rides.
   * Sets isOnline=true in the DB immediately, before the first GPS fix.
   */
  @UseGuards(WsAuthGuard)
  @Roles(UserRole.DRIVER)
  @SubscribeMessage('driver_online')
  async handleDriverOnline(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    // Ensure driverId is populated (may not be if connection was very fast)
    if (!client.data.driverId) {
      const rec = await this.gpsService.getDriverByUserId(client.data.userId);
      if (rec) {
        client.data.driverId = rec.id;
        client.data.companyId = rec.companyId;
      }
    }

    const { driverId } = client.data;
    if (driverId) {
      await this.gpsService.setOnlineStatus(driverId, true);
      await client.join('drivers:online');
      this.logger.log(`Driver ${driverId} went online (driver_online event)`);
    }
    client.emit('online_ack');
  }

  /**
   * driver_offline — driver signals they are no longer accepting rides.
   * Removes them from the Redis geo index without disconnecting the socket.
   */
  @UseGuards(WsAuthGuard)
  @Roles(UserRole.DRIVER)
  @SubscribeMessage('driver_offline')
  async handleDriverOffline(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    const { driverId } = client.data;
    if (driverId) {
      await this.gpsService.removeFromGeo(driverId);
      await client.leave('drivers:online');
      this.logger.log(`Driver ${driverId} went offline (manual)`);
    }
    client.emit('offline_ack');
  }

  /**
   * ride_message — relay a chat message between the active driver and client.
   *
   * Either side emits:  socket.emit('ride_message', { rideId, text })
   * The other party receives: 'ride_message' → { rideId, text, fromRole, ts }
   *
   * FCM fallback: if the recipient has no connected sockets (app backgrounded /
   * killed), we send a push notification so the message is not lost.
   */
  @UseGuards(WsAuthGuard)
  @SubscribeMessage('ride_message')
  async handleRideMessage(
    @MessageBody() body: { rideId: string; text: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    const text = (body?.text ?? '').trim();
    if (!text || !body?.rideId) throw new WsException('rideId and text are required');

    const { userId, role, driverId } = client.data;
    const ts = Date.now();

    const msg = { rideId: body.rideId, text, fromRole: '' as string, ts };

    if (role === UserRole.DRIVER) {
      // Driver → find client
      if (!driverId) throw new WsException('Driver profile not found');
      const clientUserId = await this.redis.get(`driver:active_client:${driverId}`);
      if (!clientUserId) throw new WsException('No active ride to chat on');

      msg.fromRole = 'driver';

      // Relay to client
      this.gatewayService.emitToRoom(`user:${clientUserId}`, 'ride_message', msg);

      // FCM fallback
      await this.sendChatFcmIfOffline(clientUserId, {
        senderLabel: 'Shoferi juaj', text,
        rideId: body.rideId, eventKey: 'ride_message_client',
      });

    } else if (role === UserRole.CLIENT) {
      // Client → find driver
      const driverUserId = await this.redis.get(`client:active_driver_user:${userId}`);
      if (!driverUserId) throw new WsException('No active ride to chat on');

      msg.fromRole = 'client';

      // Relay to driver
      this.gatewayService.emitToRoom(`user:${driverUserId}`, 'ride_message', msg);

      // FCM fallback
      await this.sendChatFcmIfOffline(driverUserId, {
        senderLabel: 'Klienti juaj', text,
        rideId: body.rideId, eventKey: 'ride_message_driver',
      });

    } else {
      throw new WsException('Only drivers and clients can send ride messages');
    }

    // ── Persist message in Redis for company dashboard ────────────────────────
    // Store for 24 h so the company can review it even just after ride ends.
    // Key: ride:chat:{rideId} — Redis list (oldest first).
    const chatKey = `ride:chat:${body.rideId}`;
    await this.redis.rpush(chatKey, JSON.stringify(msg));
    await this.redis.expire(chatKey, 86_400); // 24 h TTL

    // Relay to company room so live dashboard viewers see it instantly.
    // For driver messages: companyId is already on socket.data.
    // For client messages: look up companyId via the driver's Redis key cache.
    const companyId = client.data.companyId
      ?? await this.redis.get(`ride:company:${body.rideId}`);
    if (companyId) {
      this.gatewayService.emitToRoom(`company:${companyId}`, 'company_ride_message', msg);
    }
  }

  /**
   * Sends an FCM push notification for an in-ride chat message only when the
   * recipient has no active WebSocket connections (app is backgrounded/killed).
   * Does nothing if the recipient is currently connected — WS delivery suffices.
   */
  private async sendChatFcmIfOffline(
    recipientUserId: string,
    opts: { senderLabel: string; text: string; rideId: string; eventKey: string },
  ): Promise<void> {
    try {
      // fetchSockets() returns only sockets in this namespace on this server node.
      // For a single-node deployment this is accurate; multi-node needs Redis adapter.
      const sockets = await this.server.in(`user:${recipientUserId}`).fetchSockets();
      if (sockets.length > 0) {
        return; // Recipient is online — WebSocket delivery is sufficient
      }

      const recipientUser = await this.userRepo.findOne({
        where: { id: recipientUserId },
        select: ['fcmToken'],
      });

      if (!recipientUser?.fcmToken) return;

      const preview = opts.text.length > 80
        ? opts.text.slice(0, 77) + '…'
        : opts.text;

      await this.notificationsService.sendToToken(recipientUser.fcmToken, {
        title: `💬 ${opts.senderLabel}`,
        body: preview,
        data: { event: opts.eventKey, rideId: opts.rideId },
      });
    } catch (err) {
      // Non-fatal — a missed FCM push should never disrupt the ride
      this.logger.warn(`sendChatFcmIfOffline failed for user ${recipientUserId}: ${err}`);
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

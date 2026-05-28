import {
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { Client, Driver, User } from '../entities';
import { ClientFavoriteDriver } from '../entities/client-favorite-driver.entity';
import { REDIS_CLIENT } from '../redis/redis.module';
import { DRIVERS_GEO_KEY } from '../gps/gps.service';

export interface FavoriteDriverDto {
  /** Favorite row id — used by mobile to call DELETE */
  favoriteId:   string;
  driverId:     string;
  firstName:    string;
  lastName:     string;
  phone:        string | null;
  avatarUrl:    string | null;
  rating:       number | null;
  totalRides:   number;
  vehicleMake:  string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  vehicleColor: string | null;
  isOnline:     boolean;
  /** Last-known GPS fix for this driver, if currently online */
  lat:          number | null;
  lng:          number | null;
}

@Controller('client/favorites')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CLIENT)
export class ClientFavoritesController {
  constructor(
    @InjectRepository(ClientFavoriteDriver)
    private readonly favRepo: Repository<ClientFavoriteDriver>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /** GET /client/favorites — list the client's favorite drivers */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listFavorites(
    @Request() req: { user: { id: string } },
  ): Promise<FavoriteDriverDto[]> {
    const client = await this.resolveClient(req.user.id);
    const favs = await this.favRepo.find({
      where: { clientId: client.id },
      order: { createdAt: 'DESC' },
    });
    if (favs.length === 0) return [];

    const driverIds = favs.map(f => f.driverId);
    const drivers = await this.driverRepo
      .createQueryBuilder('d')
      .where('d.id IN (:...ids)', { ids: driverIds })
      .getMany();
    const driverMap = new Map(drivers.map(d => [d.id, d]));

    // Fetch each driver's phone (from User table) in one query
    const userIds = drivers.map(d => d.userId);
    const users = userIds.length > 0
      ? await this.userRepo
          .createQueryBuilder('u')
          .where('u.id IN (:...ids)', { ids: userIds })
          .select(['u.id', 'u.phone', 'u.avatarUrl'])
          .getMany()
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    // Online status — check Redis GEO index in batch
    const geoMembers: string[] = await this.redis.zrange(DRIVERS_GEO_KEY, 0, -1);
    const onlineSet = new Set(geoMembers);

    const result: FavoriteDriverDto[] = [];
    for (const fav of favs) {
      const d = driverMap.get(fav.driverId);
      if (!d) continue; // driver record removed — skip silently
      const u = userMap.get(d.userId);
      const isOnline = onlineSet.has(d.id);

      // Get last-known GPS if online (one round-trip per online driver — fine for typical favorites count of <20)
      let lat: number | null = null, lng: number | null = null;
      if (isOnline) {
        const raw = await this.redis.hgetall(`driver:loc:${d.id}`);
        if (raw.lat) { lat = Number(raw.lat); lng = Number(raw.lng); }
      }

      result.push({
        favoriteId:   fav.id,
        driverId:     d.id,
        firstName:    d.firstName ?? '',
        lastName:     d.lastName ?? '',
        phone:        u?.phone ?? null,
        avatarUrl:    u?.avatarUrl ?? null,
        rating:       d.rating != null ? Number(d.rating) : null,
        totalRides:   d.totalRides ?? 0,
        vehicleMake:  d.vehicleMake ?? null,
        vehicleModel: d.vehicleModel ?? null,
        vehiclePlate: d.vehiclePlate ?? null,
        vehicleColor: d.vehicleColor ?? null,
        isOnline,
        lat,
        lng,
      });
    }
    return result;
  }

  /** POST /client/favorites/:driverId — add to favorites (idempotent) */
  @Post(':driverId')
  @HttpCode(HttpStatus.CREATED)
  async addFavorite(
    @Request() req: { user: { id: string } },
    @Param('driverId', ParseUUIDPipe) driverId: string,
  ): Promise<{ favoriteId: string }> {
    const client = await this.resolveClient(req.user.id);

    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');

    const existing = await this.favRepo.findOne({
      where: { clientId: client.id, driverId },
    });
    if (existing) return { favoriteId: existing.id };

    try {
      const fav = this.favRepo.create({ clientId: client.id, driverId });
      const saved = await this.favRepo.save(fav);
      return { favoriteId: saved.id };
    } catch (err: any) {
      // Race condition on unique index — return existing instead
      if (err?.code === '23505') {
        const e = await this.favRepo.findOne({
          where: { clientId: client.id, driverId },
        });
        if (e) return { favoriteId: e.id };
      }
      throw new ConflictException('Could not save favorite');
    }
  }

  /** DELETE /client/favorites/:driverId — remove from favorites */
  @Delete(':driverId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFavorite(
    @Request() req: { user: { id: string } },
    @Param('driverId', ParseUUIDPipe) driverId: string,
  ): Promise<void> {
    const client = await this.resolveClient(req.user.id);
    await this.favRepo.delete({ clientId: client.id, driverId });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolveClient(userId: string): Promise<Client> {
    const client = await this.clientRepo.findOne({ where: { userId } });
    if (!client) throw new NotFoundException('Client profile not found');
    return client;
  }
}

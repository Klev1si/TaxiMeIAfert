import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Driver, IntercityRoute, User } from '../entities/index.js';
import type { IntercityRouteOwnerType } from '../entities/intercity-route.entity.js';

export interface IntercityRouteDto {
  fromCity:      string;
  fromLat:       number;
  fromLng:       number;
  fromRadiusKm?: number;
  toCity:        string;
  toLat:         number;
  toLng:         number;
  toRadiusKm?:   number;
  flatFare:      number;
  bidirectional?: boolean;
}

@Injectable()
export class IntercityRoutesService {
  constructor(
    @InjectRepository(IntercityRoute)
    private readonly routeRepo: Repository<IntercityRoute>,

    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  async list(ownerType: IntercityRouteOwnerType, ownerId: string): Promise<IntercityRoute[]> {
    return this.routeRepo.find({
      where: { ownerType, ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    ownerType: IntercityRouteOwnerType,
    ownerId: string,
    dto: IntercityRouteDto,
  ): Promise<IntercityRoute> {
    this.validate(dto);
    const row = this.routeRepo.create({
      ownerType,
      ownerId,
      fromCity:      dto.fromCity.trim(),
      fromLat:       dto.fromLat,
      fromLng:       dto.fromLng,
      fromRadiusKm:  dto.fromRadiusKm ?? 8,
      toCity:        dto.toCity.trim(),
      toLat:         dto.toLat,
      toLng:         dto.toLng,
      toRadiusKm:    dto.toRadiusKm ?? 8,
      flatFare:      dto.flatFare,
      bidirectional: dto.bidirectional ?? true,
      isActive:      true,
    });
    return this.routeRepo.save(row);
  }

  async update(
    id: string,
    ownerType: IntercityRouteOwnerType,
    ownerId: string,
    patch: Partial<IntercityRouteDto> & { isActive?: boolean },
  ): Promise<IntercityRoute> {
    const row = await this.routeRepo.findOne({ where: { id, ownerType, ownerId } });
    if (!row) throw new NotFoundException('Route not found');

    if (patch.fromCity      !== undefined) row.fromCity      = patch.fromCity.trim();
    if (patch.fromLat       !== undefined) row.fromLat       = patch.fromLat;
    if (patch.fromLng       !== undefined) row.fromLng       = patch.fromLng;
    if (patch.fromRadiusKm  !== undefined) row.fromRadiusKm  = patch.fromRadiusKm;
    if (patch.toCity        !== undefined) row.toCity        = patch.toCity.trim();
    if (patch.toLat         !== undefined) row.toLat         = patch.toLat;
    if (patch.toLng         !== undefined) row.toLng         = patch.toLng;
    if (patch.toRadiusKm    !== undefined) row.toRadiusKm    = patch.toRadiusKm;
    if (patch.flatFare      !== undefined) row.flatFare      = patch.flatFare;
    if (patch.bidirectional !== undefined) row.bidirectional = patch.bidirectional;
    if (patch.isActive      !== undefined) row.isActive      = patch.isActive;

    this.validate(row);
    return this.routeRepo.save(row);
  }

  async remove(id: string, ownerType: IntercityRouteOwnerType, ownerId: string): Promise<void> {
    const res = await this.routeRepo.delete({ id, ownerType, ownerId });
    if (!res.affected) throw new NotFoundException('Route not found');
  }

  // ── Matching ────────────────────────────────────────────────────────────

  /**
   * Look across ALL active routes in the system for the best match, without
   * caring who owns them. Used at estimate time (no driver assigned yet) so
   * the rider sees the lowest available flat fare.
   */
  async findAnyMatch(
    pickup: { lat: number; lng: number },
    dropoff: { lat: number; lng: number },
  ): Promise<IntercityRoute | null> {
    const routes = await this.routeRepo.find({ where: { isActive: true } });
    let best: IntercityRoute | null = null;
    for (const r of routes) {
      const forwardMatch =
        this.withinRadius(pickup, r.fromLat, r.fromLng, Number(r.fromRadiusKm)) &&
        this.withinRadius(dropoff, r.toLat, r.toLng, Number(r.toRadiusKm));
      const reverseMatch =
        r.bidirectional &&
        this.withinRadius(pickup, r.toLat, r.toLng, Number(r.toRadiusKm)) &&
        this.withinRadius(dropoff, r.fromLat, r.fromLng, Number(r.fromRadiusKm));
      if (!forwardMatch && !reverseMatch) continue;
      if (!best || Number(r.flatFare) < Number(best.flatFare)) best = r;
    }
    return best;
  }

  /**
   * Find the best intercity route for a pickup → dropoff pair from the pool
   * of owners the trip could be served by. Returns the lowest matching flat
   * fare or null when no route matches.
   *
   * If the trip's driver is already known (e.g. after accept), pass their id
   * so only that driver's routes and their company's routes are considered.
   * Before a driver is assigned (estimate stage), pass all candidate driver
   * ids so the rider sees the best available flat fare.
   */
  async findMatch(
    pickup: { lat: number; lng: number },
    dropoff: { lat: number; lng: number },
    candidateDriverIds: string[],
  ): Promise<IntercityRoute | null> {
    if (candidateDriverIds.length === 0) return null;

    // Load candidate drivers to know their companyIds
    const drivers = await this.driverRepo.find({
      where: { id: In(candidateDriverIds) },
      select: ['id', 'companyId'],
    });
    const companyIds = Array.from(new Set(
      drivers.map(d => d.companyId).filter((c): c is string => c != null),
    ));

    // Load every active route owned by these drivers OR these companies
    const routes = await this.routeRepo.find({
      where: [
        { ownerType: 'driver',  ownerId: In(candidateDriverIds), isActive: true },
        ...(companyIds.length > 0
          ? [{ ownerType: 'company' as const, ownerId: In(companyIds), isActive: true }]
          : []),
      ],
    });

    // Filter to geographic matches and pick the lowest fare
    let best: IntercityRoute | null = null;
    for (const r of routes) {
      const forwardMatch =
        this.withinRadius(pickup, r.fromLat, r.fromLng, Number(r.fromRadiusKm)) &&
        this.withinRadius(dropoff, r.toLat, r.toLng, Number(r.toRadiusKm));
      const reverseMatch =
        r.bidirectional &&
        this.withinRadius(pickup, r.toLat, r.toLng, Number(r.toRadiusKm)) &&
        this.withinRadius(dropoff, r.fromLat, r.fromLng, Number(r.fromRadiusKm));
      if (!forwardMatch && !reverseMatch) continue;

      if (!best || Number(r.flatFare) < Number(best.flatFare)) best = r;
    }
    return best;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private validate(dto: IntercityRouteDto | IntercityRoute) {
    const fare = Number(dto.flatFare);
    if (!Number.isFinite(fare) || fare <= 0) {
      throw new BadRequestException('flatFare must be positive.');
    }
    if (!dto.fromCity?.trim() || !dto.toCity?.trim()) {
      throw new BadRequestException('fromCity and toCity are required.');
    }
    if (!Number.isFinite(Number(dto.fromLat)) || !Number.isFinite(Number(dto.fromLng)) ||
        !Number.isFinite(Number(dto.toLat))   || !Number.isFinite(Number(dto.toLng))) {
      throw new BadRequestException('City coordinates must be valid numbers.');
    }
  }

  private withinRadius(
    point: { lat: number; lng: number },
    centerLat: number,
    centerLng: number,
    radiusKm: number,
  ): boolean {
    return this.haversineKm(point.lat, point.lng, centerLat, centerLng) <= radiusKm;
  }

  private haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Driver } from '../entities/index.js';
import { GpsService } from '../gps/gps.service.js';
import { NearestDriverDto } from './dto/nearest-driver.dto.js';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    private readonly gpsService: GpsService,
  ) {}

  // ── GET /rides/nearest-drivers ─────────────────────────────────────────────
  async findNearestDrivers(
    lat: number,
    lng: number,
    radiusKm: number,
    limit: number,
  ): Promise<NearestDriverDto[]> {
    // 1. Query Redis geo index for online drivers within radius
    const geoResults = await this.gpsService.findNearestDrivers(
      lat,
      lng,
      radiusKm,
      limit,
    );

    if (geoResults.length === 0) return [];

    // 2. Enrich with driver profile data from PostgreSQL
    const driverIds = geoResults.map((r) => r.driverId);
    const drivers = await this.driverRepo.find({
      where: { id: In(driverIds), isApproved: true },
      select: [
        'id',
        'firstName',
        'lastName',
        'vehicleMake',
        'vehicleModel',
        'vehicleYear',
        'vehiclePlate',
        'vehicleColor',
        'rating',
      ],
    });

    // Index by id for O(1) lookup
    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    // 3. Merge and filter (skip any driverId not found in DB or not approved)
    const results: NearestDriverDto[] = [];
    for (const geo of geoResults) {
      const d = driverMap.get(geo.driverId);
      if (!d) continue; // stale geo entry — driver deactivated or not approved

      results.push({
        driverId: geo.driverId,
        distanceKm: geo.distanceKm,
        lat: geo.lat,
        lng: geo.lng,
        firstName: d.firstName,
        lastName: d.lastName,
        vehicleMake: d.vehicleMake,
        vehicleModel: d.vehicleModel,
        vehicleYear: d.vehicleYear,
        vehiclePlate: d.vehiclePlate,
        vehicleColor: d.vehicleColor,
        rating: Number(d.rating),
      });
    }

    this.logger.debug(
      `Nearest drivers: found ${results.length} within ${radiusKm}km of (${lat},${lng})`,
    );

    return results;
  }
}

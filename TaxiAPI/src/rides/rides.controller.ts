import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RidesService } from './rides.service.js';
import { NearestDriversQueryDto } from './dto/nearest-drivers-query.dto.js';
import { NearestDriverDto } from './dto/nearest-driver.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('rides')
@UseGuards(JwtAuthGuard) // all rides endpoints require a valid access token
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  /**
   * GET /rides/nearest-drivers?lat=40.1872&lng=44.5152&radius=5&limit=10
   *
   * Returns online, approved drivers within <radius> km sorted by distance.
   * Only drivers currently connected via WebSocket appear here (their position
   * is live in the Redis geo index).
   */
  @Get('nearest-drivers')
  @HttpCode(HttpStatus.OK)
  findNearestDrivers(
    @Query() query: NearestDriversQueryDto,
  ): Promise<NearestDriverDto[]> {
    return this.ridesService.findNearestDrivers(
      query.lat,
      query.lng,
      query.radius ?? 5,
      query.limit ?? 10,
    );
  }
}

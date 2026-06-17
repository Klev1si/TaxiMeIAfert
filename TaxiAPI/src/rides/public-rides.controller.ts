/**
 * Public, unauthenticated tracking endpoint for "share my trip" links.
 * The token gates access — anyone with the URL can see the minimal payload
 * until the ride ends.
 */
import {
  Controller, Get, HttpCode, HttpStatus, NotFoundException, Param,
} from '@nestjs/common';
import { RidesService } from './rides.service.js';

@Controller('public/rides')
export class PublicRidesController {
  constructor(private readonly ridesService: RidesService) {}

  /** GET /public/rides/track/:token — no auth required. */
  @Get('track/:token')
  @HttpCode(HttpStatus.OK)
  async track(@Param('token') token: string) {
    const payload = await this.ridesService.getPublicRideByToken(token);
    if (!payload) {
      throw new NotFoundException('Tracking link expired or invalid');
    }
    return payload;
  }
}

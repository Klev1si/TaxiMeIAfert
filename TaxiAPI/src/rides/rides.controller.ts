import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RidesService } from './rides.service.js';
import { NearestDriversQueryDto } from './dto/nearest-drivers-query.dto.js';
import { NearestDriverDto } from './dto/nearest-driver.dto.js';
import { RequestRideDto } from './dto/request-ride.dto.js';
import { RideResponseDto } from './dto/ride-response.dto.js';
import { CancelRideDto } from './dto/cancel-ride.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';

@Controller('rides')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  // ── GET /rides/nearest-drivers ─────────────────────────────────────────────
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

  // ── POST /rides/request ────────────────────────────────────────────────────
  /**
   * Client submits a ride request.
   * Finds the nearest available driver, creates a Ride in the DB,
   * sends a WebSocket event + FCM push to the chosen driver.
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.CLIENT)
  requestRide(
    @Request() req: { user: { id: string } },
    @Body() dto: RequestRideDto,
  ): Promise<RideResponseDto> {
    return this.ridesService.requestRide(req.user.id, dto);
  }

  // ── POST /rides/:id/accept ─────────────────────────────────────────────────
  /**
   * Driver accepts an incoming ride request.
   * Updates ride status to ACCEPTED and notifies the client.
   */
  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  acceptRide(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<RideResponseDto> {
    return this.ridesService.acceptRide(req.user.id, rideId);
  }

  // ── POST /rides/:id/decline ────────────────────────────────────────────────
  /**
   * Driver declines an incoming ride request.
   * The server tries the next nearest available driver, or cancels the ride
   * if no more candidates exist.
   */
  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  declineRide(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<{ message: string }> {
    return this.ridesService.declineRide(req.user.id, rideId);
  }

  // ── POST /rides/:id/en-route ───────────────────────────────────────────────
  /**
   * Driver confirms they are driving toward the pickup location.
   * Status: accepted → driving_to_pickup
   */
  @Post(':id/en-route')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  markEnRoute(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<RideResponseDto> {
    return this.ridesService.markEnRoute(req.user.id, rideId);
  }

  // ── POST /rides/:id/arrived ────────────────────────────────────────────────
  /**
   * Driver has arrived at the pickup location.
   * Records pickupArrivedAt timestamp and notifies the client.
   */
  @Post(':id/arrived')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  markArrived(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<RideResponseDto> {
    return this.ridesService.markArrived(req.user.id, rideId);
  }

  // ── POST /rides/:id/start ──────────────────────────────────────────────────
  /**
   * Driver has picked up the client — trip begins.
   * Status: accepted/driving_to_pickup → in_progress
   */
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  startRide(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<RideResponseDto> {
    return this.ridesService.startRide(req.user.id, rideId);
  }

  // ── POST /rides/:id/complete ───────────────────────────────────────────────
  /**
   * Driver has dropped off the client — trip ends.
   * Status: in_progress → completed
   */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  completeRide(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<RideResponseDto> {
    return this.ridesService.completeRide(req.user.id, rideId);
  }

  // ── POST /rides/:id/cancel ─────────────────────────────────────────────────
  /**
   * Cancel a ride.
   *
   * Clients may cancel when status is: requested, accepted, driving_to_pickup.
   * Drivers may cancel when status is: accepted, driving_to_pickup.
   *
   * The other party is notified via WebSocket + FCM.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  cancelRide(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('id', ParseUUIDPipe) rideId: string,
    @Body() dto: CancelRideDto,
  ): Promise<RideResponseDto> {
    return this.ridesService.cancelRide(req.user.id, req.user.role, rideId, dto);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFloatPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { RidesService } from './rides.service.js';
import { NearestDriversQueryDto } from './dto/nearest-drivers-query.dto.js';
import { NearestDriverDto } from './dto/nearest-driver.dto.js';
import { RequestRideDto } from './dto/request-ride.dto.js';
import { RideResponseDto, RideStopResponseDto } from './dto/ride-response.dto.js';
import { CancelRideDto } from './dto/cancel-ride.dto.js';
import { RateRideDto } from './dto/rate-ride.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole, VehicleType } from '../common/enums/index.js';

class CompleteRideDto {
  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  distanceKm?: number;

  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  durationMinutes?: number;

  /** Driver-supplied fare override — used when no company tariff is configured */
  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  totalFare?: number;
}

class EditFareDto {
  /** New total fare for the ride. Must be ≥ 0. */
  @IsNumber() @Min(0) @Type(() => Number)
  totalFare: number;

  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  distanceKm?: number;

  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  durationMinutes?: number;
}

@Controller('rides')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  // ── GET /rides/validate-promo?code=XXX&fare=12.50 ────────────────────────
  /**
   * Validates a promo code and returns the discount details.
   * Pass `fare` (optional) to preview the exact discount amount.
   * Available to authenticated clients.
   */
  @Get('validate-promo')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT)
  validatePromo(
    @Query('code') code: string,
    @Query('fare') fare?: string,
  ) {
    const estimatedFare = fare != null ? parseFloat(fare) : undefined;
    return this.ridesService.validatePromo(code, estimatedFare);
  }

  // ── GET /rides/estimate ────────────────────────────────────────────────────
  /**
   * Returns an estimated fare for a pickup → dropoff trip.
   * Uses the active global (platform) tariff + Haversine distance.
   * No auth required — accessible to any logged-in client.
   */
  @Get('estimate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT)
  estimateFare(
    @Query('pickupLat',    ParseFloatPipe) pickupLat:    number,
    @Query('pickupLng',    ParseFloatPipe) pickupLng:    number,
    @Query('dropoffLat',   ParseFloatPipe) dropoffLat:   number,
    @Query('dropoffLng',   ParseFloatPipe) dropoffLng:   number,
    @Query('vehicleType')                 vehicleType?: VehicleType,
    // JSON-encoded array of {lat, lng} intermediate stops. Kept as a
    // string so the query stays flat and cacheable. Optional.
    @Query('stops')                       stopsRaw?:    string,
  ) {
    let stops: Array<{ lat: number; lng: number }> = [];
    if (stopsRaw) {
      try {
        const parsed = JSON.parse(stopsRaw);
        if (Array.isArray(parsed)) {
          stops = parsed
            .filter(s => typeof s?.lat === 'number' && typeof s?.lng === 'number')
            .slice(0, 5);
        }
      } catch { /* ignore malformed stops — fall back to pickup→dropoff only */ }
    }
    return this.ridesService.estimateFare(
      pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleType ?? null, stops,
    );
  }

  // ── GET /rides/nearest-drivers ─────────────────────────────────────────────
  @Get('nearest-drivers')
  @HttpCode(HttpStatus.OK)
  findNearestDrivers(
    @Query() query: NearestDriversQueryDto,
    @Query('vehicleType') vehicleType?: VehicleType,
  ): Promise<NearestDriverDto[]> {
    return this.ridesService.findNearestDrivers(
      query.lat,
      query.lng,
      query.radius ?? 5,
      query.limit ?? 10,
      vehicleType ?? null,
    );
  }

  // ── POST /rides/:id/share-token ───────────────────────────────────────────
  /**
   * Issue (or return existing) public tracking token for an active ride.
   * Client-only. The returned token can be embedded in a URL the user
   * shares with friends/family for live-tracking.
   */
  @Post(':id/share-token')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT)
  createShareToken(
    @Request() req: { user: { id: string } },
    @Param('id', new ParseUUIDPipe()) rideId: string,
  ): Promise<{ token: string }> {
    return this.ridesService.createShareToken(req.user.id, rideId);
  }

  // ── GET /rides/active ─────────────────────────────────────────────────────
  /**
   * Returns the caller's current active ride (status: requested / accepted /
   * driving_to_pickup / in_progress), or null when there is none.
   *
   * Used by the mobile app on startup to resume a ride after the app was killed.
   */
  @Get('active')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  getActiveRide(
    @Request() req: { user: { id: string; role: UserRole } },
  ): Promise<RideResponseDto | null> {
    return this.ridesService.getActiveRide(req.user.id, req.user.role);
  }

  // ── GET /rides/history ────────────────────────────────────────────────────
  /**
   * Returns paginated ride history for the authenticated user.
   * Clients see rides where they are the client.
   * Drivers see rides where they are the driver.
   */
  @Get('history')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  getRideHistory(
    @Request() req: { user: { id: string; role: UserRole } },
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ): Promise<RideResponseDto[]> {
    return this.ridesService.getRideHistory(req.user.id, req.user.role, +page, +limit);
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
   * Body (optional): { distanceKm, durationMinutes } — used for fare calculation.
   */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  completeRide(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
    @Body() dto: CompleteRideDto,
  ): Promise<RideResponseDto> {
    return this.ridesService.completeRide(req.user.id, rideId, dto);
  }

  // ── PATCH /rides/:id/fare ──────────────────────────────────────────────────
  /**
   * Driver edits the total fare on a ride they completed.
   * Use case: the ride completed without a fare (no tariff configured + driver
   * forgot to enter one), or the entered fare was wrong. This re-credits the
   * driver's wallet with the corrected amount so they don't lose the earnings.
   *
   * Only the driver who completed the ride may edit it. Allowed for rides in
   * status COMPLETED or IN_PROGRESS (the latter handles "stuck" rides).
   */
  @Patch(':id/fare')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  editRideFare(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
    @Body() dto: EditFareDto,
  ): Promise<RideResponseDto> {
    return this.ridesService.editRideFare(req.user.id, rideId, dto);
  }

  // ── GET /rides/ratings ────────────────────────────────────────────────────
  /**
   * Driver's rating breakdown: overall average, total count,
   * per-star counts (1–5), and the 10 most-recent reviews.
   */
  @Get('ratings')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  getDriverRatings(
    @Request() req: { user: { id: string } },
  ) {
    return this.ridesService.getDriverRatings(req.user.id);
  }

  // ── GET /rides/earnings?period=today|week|month|all ────────────────────────
  /**
   * Driver's earnings summary for the requested period.
   * Returns totalFare, driver's share (after company commission), and ride count.
   */
  @Get('earnings')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  getDriverEarnings(
    @Request() req: { user: { id: string } },
    @Query('period') period = 'all',
  ) {
    return this.ridesService.getDriverEarnings(req.user.id, period);
  }

  // ── GET /rides/:id ────────────────────────────────────────────────────────
  /**
   * Fetch any ride the caller owns (client or driver). Unlike /active, this
   * works for completed/cancelled rides too — used by the RateRide screen
   * to re-hydrate the ride after the store has been cleared on payment.
   *
   * Declared AFTER all static-path GETs (active, history, ratings, earnings)
   * because NestJS matches in declaration order and the UUID pipe would
   * otherwise reject those words with HTTP 400.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  getRideById(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<RideResponseDto> {
    return this.ridesService.getRideById(req.user.id, req.user.role, rideId);
  }

  // ── POST /rides/:id/pay-cash ───────────────────────────────────────────────
  /**
   * Driver confirms cash payment received after ride completion.
   * Sets paymentStatus → paid and notifies the client.
   * (Stripe / card payments will be added in a future step.)
   */
  @Post(':id/pay-cash')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  confirmCashPayment(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<RideResponseDto> {
    return this.ridesService.confirmCashPayment(req.user.id, rideId);
  }

  // ── POST /rides/:id/no-show ───────────────────────────────────────────────────
  /**
   * Report a no-show for the current ride.
   *
   * DRIVER: passenger didn't show up at pickup. Ride is cancelled and the
   *   passenger is charged a no-show fee (NOSHOW_PASSENGER_FEE).
   *   Requires: status=driving_to_pickup AND pickupArrivedAt is set.
   *
   * CLIENT: driver never arrived. Ride is cancelled free of charge.
   *   Requires: status=accepted/driving_to_pickup (before arrival) AND
   *   at least NOSHOW_DRIVER_WAIT_MINUTES have passed since acceptance.
   */
  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  reportNoShow(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<RideResponseDto> {
    return this.ridesService.reportNoShow(req.user.id, req.user.role, rideId);
  }

  // ── GET /rides/:id/cancellation-fee ──────────────────────────────────────────
  /**
   * Preview the cancellation fee the current user would incur if they cancel now.
   * Returns { fee: number, isFree: boolean, reason: string }.
   *
   * Called by the mobile app before showing the cancel confirmation modal.
   * Clients only — drivers are never charged.
   */
  @Get(':id/cancellation-fee')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  getCancellationFee(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<{ fee: number; isFree: boolean; reason: string }> {
    return this.ridesService.getCancellationFee(req.user.id, req.user.role, rideId);
  }

  // ── POST /rides/:id/cancel ─────────────────────────────────────────────────
  /**
   * Cancel a ride.
   *
   * Clients may cancel when status is: requested, accepted, driving_to_pickup.
   * Drivers may cancel when status is: accepted, driving_to_pickup.
   *
   * The other party is notified via WebSocket + FCM.
   * If the client cancels outside the grace period, a cancellation_fee is stored.
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

  // ── POST /rides/:id/rate ───────────────────────────────────────────────────
  /**
   * Submit a star rating (1–5) with optional review for a completed ride.
   *
   * Client rates the driver  → updates driver.rating average.
   * Driver rates the client  → updates client.rating average.
   * Each side may rate only once per ride.
   */
  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  rateRide(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('id', ParseUUIDPipe) rideId: string,
    @Body() dto: RateRideDto,
  ): Promise<RideResponseDto> {
    return this.ridesService.rateRide(req.user.id, req.user.role, rideId, dto);
  }

  // ── GET /rides/:id/route  (CLIENT or DRIVER — Step 100) ─────────────────────
  @Get(':id/route')
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  getRideRoute(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('id', ParseUUIDPipe) rideId: string,
  ): Promise<Array<{ lat: number; lng: number; recordedAt: Date }>> {
    return this.ridesService.getRideRoute(req.user.id, req.user.role, rideId);
  }

  // ── POST /rides/:id/stops/:stopId/reached  (DRIVER only) ─────────────────────
  /**
   * Driver taps "Reached stop" on their screen to mark an intermediate stop.
   * Emits a `stop_reached` WS event to the client.
   */
  @Post(':id/stops/:stopId/reached')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DRIVER)
  markStopReached(
    @Request() req: { user: { id: string } },
    @Param('id',     ParseUUIDPipe) rideId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ): Promise<RideStopResponseDto> {
    return this.ridesService.markStopReached(req.user.id, rideId, stopId);
  }
}

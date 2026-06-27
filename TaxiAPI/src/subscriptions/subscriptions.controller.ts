import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsUUID } from 'class-validator';
import { SubscriptionsService } from './subscriptions.service.js';
import { PayseraService } from '../paysera/paysera.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { User } from '../entities/index.js';
import { UserRole } from '../common/enums/index.js';
import type { PlanAudience } from '../entities/subscription-plan.entity.js';

// ── DTOs ──────────────────────────────────────────────────────────────────────

class SubscribeDto {
  @IsUUID()
  planId: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('subscriptions')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(
    private readonly service: SubscriptionsService,
    private readonly paysera: PayseraService,
  ) {}

  /**
   * GET /subscriptions/plans?audience=company|driver
   * Public — no authentication required.
   * Returns plans for the specified audience (defaults to 'company').
   */
  @Get('plans')
  listPlans(@Query('audience') audience?: string) {
    const aud: PlanAudience =
      audience === 'driver' ? 'driver' : 'company';
    return this.service.listPlans(aud);
  }

  // ── Company routes ─────────────────────────────────────────────────────────

  /**
   * GET /subscriptions/my
   * Returns the company's current subscription (with plan details), or null.
   */
  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY)
  getMy(@CurrentUser() user: User) {
    return this.service.getMySubscription(user.id);
  }

  /**
   * POST /subscriptions/subscribe
   * Subscribe a company to a plan or switch plans.
   */
  @Post('subscribe')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY)
  @HttpCode(HttpStatus.OK)
  subscribe(
    @CurrentUser() user: User,
    @Body() dto: SubscribeDto,
  ) {
    return this.service.subscribe(user.id, dto.planId);
  }

  /**
   * POST /subscriptions/cancel
   * Cancel the company's current subscription.
   */
  @Post('cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY)
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: User) {
    return this.service.cancel(user.id);
  }

  // ── Driver routes ──────────────────────────────────────────────────────────

  /**
   * GET /subscriptions/driver/my
   * Returns the driver's current subscription (with plan details), or null.
   */
  @Get('driver/my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getDriverMy(@CurrentUser() user: User) {
    return this.service.getMyDriverSubscription(user.id);
  }

  /**
   * POST /subscriptions/driver/subscribe
   * Subscribe a driver to a driver plan or switch driver plans.
   */
  @Post('driver/subscribe')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(HttpStatus.OK)
  driverSubscribe(
    @CurrentUser() user: User,
    @Body() dto: SubscribeDto,
  ) {
    return this.service.driverSubscribe(user.id, dto.planId);
  }

  /**
   * POST /subscriptions/driver/cancel
   * Cancel the driver's current subscription.
   */
  @Post('driver/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(HttpStatus.OK)
  driverCancel(@CurrentUser() user: User) {
    return this.service.driverCancel(user.id);
  }

  // ── Cash request (subscriber side) ─────────────────────────────────────────

  /**
   * POST /subscriptions/cash-request
   * Subscriber chooses to pay in cash. Creates a PENDING subscription;
   * admin will mark it as paid after receiving the cash.
   */
  @Post('cash-request')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY, UserRole.DRIVER)
  @HttpCode(HttpStatus.OK)
  cashRequest(
    @CurrentUser() user: User,
    @Body() dto: SubscribeDto,
  ) {
    const audience: PlanAudience =
      user.role === UserRole.DRIVER ? 'driver' : 'company';
    return this.service.startCashRequest(user.id, dto.planId, audience);
  }

  // ── Paysera card checkout ──────────────────────────────────────────────────

  /**
   * POST /subscriptions/checkout
   * Start a card-payment checkout for the caller's audience (company or driver).
   * Returns a Paysera redirect URL the client should open.
   */
  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY, UserRole.DRIVER)
  @HttpCode(HttpStatus.OK)
  startCheckout(
    @CurrentUser() user: User,
    @Body() dto: SubscribeDto,
  ) {
    const audience: PlanAudience =
      user.role === UserRole.DRIVER ? 'driver' : 'company';
    return this.service.startCardCheckout(user.id, dto.planId, audience);
  }

  /**
   * POST /subscriptions/paysera/callback
   * Server-to-server notification from Paysera. Public — verified via signature.
   * Must respond with the literal text "OK" so Paysera stops retrying.
   */
  @Post('paysera/callback')
  @HttpCode(HttpStatus.OK)
  async payseraCallback(
    @Body() body: { data?: string; ss1?: string },
    @Res() res: Response,
  ) {
    try {
      const fields = this.paysera.parseCallback(body);
      await this.service.applyPayseraCallback(fields);
      res.type('text/plain').send('OK');
    } catch (err: any) {
      this.logger.warn(`Paysera callback rejected: ${err.message}`);
      res.status(HttpStatus.BAD_REQUEST).type('text/plain').send('BAD');
    }
  }

  /**
   * GET /subscriptions/paysera/return
   * User-facing redirect target after Paysera checkout (accept or cancel).
   * Returns a minimal HTML page that mobile apps can detect via deep-link
   * (taxiapp://subscription/status?status=accept|cancel).
   */
  @Get('paysera/return')
  payseraReturn(
    @Query('status') status: string,
    @Query('subId') subId: string,
    @Res() res: Response,
  ) {
    const safeStatus = status === 'accept' ? 'accept' : 'cancel';
    const deeplink = `taxiapp://subscription/status?status=${safeStatus}&subId=${encodeURIComponent(subId ?? '')}`;
    res.type('text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Payment ${safeStatus}</title>
<meta http-equiv="refresh" content="0;url=${deeplink}">
<style>body{font-family:sans-serif;text-align:center;padding:48px 16px;}</style></head>
<body>
  <h2>Payment ${safeStatus === 'accept' ? 'received' : 'cancelled'}</h2>
  <p>Returning to the app…</p>
  <p><a href="${deeplink}">Tap here if not redirected automatically.</a></p>
</body></html>`);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { SubscriptionsService } from './subscriptions.service.js';
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
  constructor(private readonly service: SubscriptionsService) {}

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
}

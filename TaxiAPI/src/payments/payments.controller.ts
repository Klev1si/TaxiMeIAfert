import type { RawBodyRequest } from '@nestjs/common';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request as NestRequest,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaymentsService } from './payments.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';

class CreateIntentDto {
  @IsUUID()
  rideId: string;

  /** When provided, the server auto-confirms the intent using this saved card. */
  @IsOptional()
  @IsString()
  savedPaymentMethodId?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ── POST /payments/create-intent  (CLIENT only) ────────────────────────────
  /**
   * Creates (or retrieves) a Stripe PaymentIntent for a completed ride.
   *
   * Without savedPaymentMethodId:
   *   Returns { clientSecret, amount, currency } for the Stripe payment sheet.
   *
   * With savedPaymentMethodId:
   *   Confirms the intent server-side. Returns { autoCharged: true } when the
   *   charge succeeds immediately, or { clientSecret, requiresAction: true }
   *   when 3-D Secure is needed.
   */
  @Post('create-intent')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  createIntent(
    @NestRequest() req: { user: { id: string } },
    @Body() dto: CreateIntentDto,
  ) {
    return this.paymentsService.createPaymentIntent(
      req.user.id,
      dto.rideId,
      dto.savedPaymentMethodId,
    );
  }

  // ── POST /payments/setup-intent  (CLIENT only) ─────────────────────────────
  /**
   * Creates a Stripe SetupIntent so the mobile app can save a card for future
   * payments.  Also creates/retrieves the Stripe Customer for this client and
   * generates a short-lived Ephemeral Key the Stripe SDK needs.
   */
  @Post('setup-intent')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  createSetupIntent(@NestRequest() req: { user: { id: string } }) {
    return this.paymentsService.createSetupIntent(req.user.id);
  }

  // ── GET /payments/payment-methods  (CLIENT only) ───────────────────────────
  /**
   * Returns all saved cards for the authenticated client.
   * Each item: { id, brand, last4, expMonth, expYear }
   */
  @Get('payment-methods')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  getPaymentMethods(@NestRequest() req: { user: { id: string } }) {
    return this.paymentsService.getPaymentMethods(req.user.id);
  }

  // ── DELETE /payments/payment-methods/:id  (CLIENT only) ────────────────────
  /**
   * Detaches (permanently removes) a saved card from the client's Stripe Customer.
   */
  @Delete('payment-methods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  detachPaymentMethod(
    @NestRequest() req: { user: { id: string } },
    @Param('id') paymentMethodId: string,
  ) {
    return this.paymentsService.detachPaymentMethod(req.user.id, paymentMethodId);
  }

  // ── POST /payments/webhook  (NO auth — Stripe calls this directly) ──────────
  /**
   * Stripe webhook receiver.
   *
   * IMPORTANT: This endpoint MUST receive the raw (unparsed) request body
   * for the HMAC signature check to pass.  NestFactory.create is called with
   * `{ rawBody: true }` in main.ts so `req.rawBody` is populated.
   *
   * Set the endpoint URL in the Stripe Dashboard:
   *   https://dashboard.stripe.com/webhooks
   *   URL: https://your-domain.com/payments/webhook
   *   Events to listen to:
   *     • payment_intent.succeeded
   *     • payment_intent.payment_failed
   *     • payment_intent.canceled
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @NestRequest() req: RawBodyRequest<any>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException(
        'rawBody is missing — ensure NestFactory.create is called with { rawBody: true }',
      );
    }
    await this.paymentsService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}

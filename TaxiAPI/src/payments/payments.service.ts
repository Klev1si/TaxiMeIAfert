import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Client, Driver, Ride, User } from '../entities/index.js';
import { PaymentStatus, RideStatus, UserRole } from '../common/enums/index.js';
import { GatewayService } from '../gateway/gateway.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export interface SavedCard {
  id:       string;
  brand:    string;
  last4:    string;
  expMonth: number;
  expYear:  number;
}

export interface CreateIntentResult {
  /** Present to the Stripe SDK when the charge could not be auto-confirmed. */
  clientSecret?: string;
  amount:   number;
  currency: string;
  /** true when the intent was confirmed server-side with no client action needed. */
  autoCharged?: boolean;
  /** true when 3-D Secure or another action is still required by the client. */
  requiresAction?: boolean;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Ride)   private readonly rideRepo:   Repository<Ride>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    @InjectRepository(User)   private readonly userRepo:   Repository<User>,
    private readonly gatewayService:       GatewayService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY') ?? '',
      { apiVersion: '2024-04-10' },
    );
  }

  // ── POST /payments/create-intent ─────────────────────────────────────────────
  /**
   * Creates a Stripe PaymentIntent for a completed ride.
   *
   * • Without savedPaymentMethodId — returns clientSecret for the Stripe payment sheet.
   * • With savedPaymentMethodId   — confirms the intent server-side immediately.
   *   - autoCharged: true  → payment already succeeded; WS event will follow.
   *   - requiresAction: true → 3-D Secure needed; clientSecret returned for the app to handle.
   */
  async createPaymentIntent(
    clientUserId: string,
    rideId: string,
    savedPaymentMethodId?: string,
  ): Promise<CreateIntentResult> {
    const client = await this.clientRepo.findOne({ where: { userId: clientUserId } });
    if (!client) throw new NotFoundException('Client profile not found');

    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    if (ride.clientId !== client.id) {
      throw new ForbiddenException('This is not your ride');
    }
    if (ride.status !== RideStatus.COMPLETED) {
      throw new BadRequestException('Ride must be completed before payment');
    }
    if (ride.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This ride has already been paid');
    }
    if (ride.totalFare == null) {
      throw new BadRequestException('Fare has not been calculated for this ride');
    }

    // Amount in smallest unit (cents for USD)
    const amountCents = Math.round(Number(ride.totalFare) * 100);
    const currency    = this.configService.get<string>('STRIPE_CURRENCY') ?? 'usd';

    // Reuse an existing intent if one was already created (idempotency)
    if (ride.stripePaymentIntentId) {
      try {
        const existing = await this.stripe.paymentIntents.retrieve(
          ride.stripePaymentIntentId,
        );
        if (
          existing.status !== 'succeeded' &&
          existing.status !== 'canceled'
        ) {
          return {
            clientSecret: existing.client_secret!,
            amount:       existing.amount,
            currency:     existing.currency,
          };
        }
      } catch {
        // intent not found or cancelled — create a fresh one below
      }
    }

    // ── Auto-charge with a saved payment method ──────────────────────────────
    if (savedPaymentMethodId) {
      // Verify the payment method belongs to this customer
      if (!client.stripeCustomerId) {
        throw new BadRequestException('No Stripe customer found for this client');
      }
      const pm = await this.stripe.paymentMethods.retrieve(savedPaymentMethodId);
      if (pm.customer !== client.stripeCustomerId) {
        throw new ForbiddenException('Payment method does not belong to this customer');
      }

      const intent = await this.stripe.paymentIntents.create({
        amount:         amountCents,
        currency,
        customer:       client.stripeCustomerId,
        payment_method: savedPaymentMethodId,
        confirm:        true,
        metadata:       { rideId, clientId: client.id },
        // For off-session we must set this; for on-session we don't need it
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      });

      ride.stripePaymentIntentId = intent.id;
      await this.rideRepo.save(ride);

      this.logger.log(
        `Auto-charge PaymentIntent ${intent.id} for ride ${rideId} — status: ${intent.status}`,
      );

      if (intent.status === 'succeeded') {
        // Immediately fire the WS event — don't wait for the webhook
        await this.onSucceeded(intent);
        return { autoCharged: true, amount: amountCents, currency };
      }

      if (intent.status === 'requires_action') {
        return {
          clientSecret:   intent.client_secret!,
          requiresAction: true,
          amount:         amountCents,
          currency,
        };
      }

      // Fallback — return clientSecret so the app can handle any other state
      return {
        clientSecret: intent.client_secret!,
        amount:       amountCents,
        currency,
      };
    }

    // ── Standard flow — present Stripe payment sheet ──────────────────────────
    const intent = await this.stripe.paymentIntents.create({
      amount:   amountCents,
      currency,
      metadata: { rideId, clientId: client.id },
      // automatic_payment_methods lets the Stripe SDK choose the best UI
      automatic_payment_methods: { enabled: true },
    });

    // Persist the intent ID so the webhook can look up the ride later
    ride.stripePaymentIntentId = intent.id;
    await this.rideRepo.save(ride);

    this.logger.log(
      `PaymentIntent ${intent.id} created for ride ${rideId} — ${currency} ${amountCents / 100}`,
    );

    return {
      clientSecret: intent.client_secret!,
      amount:       amountCents,
      currency,
    };
  }

  // ── POST /payments/setup-intent ───────────────────────────────────────────────
  /**
   * Creates a Stripe SetupIntent so the client can save a card for future payments.
   * Also creates a Stripe Customer if none exists yet and stores the ID in the DB.
   */
  async createSetupIntent(clientUserId: string): Promise<{
    setupIntentClientSecret: string;
    ephemeralKey: string;
    customerId: string;
  }> {
    const client = await this.clientRepo.findOne({ where: { userId: clientUserId } });
    if (!client) throw new NotFoundException('Client profile not found');

    // Get or lazily create a Stripe Customer
    let customerId = client.stripeCustomerId;
    if (!customerId) {
      const user = await this.userRepo.findOne({ where: { id: clientUserId } });
      const customer = await this.stripe.customers.create({
        phone:    user?.phone,
        metadata: { clientId: client.id },
      });
      customerId = customer.id;
      client.stripeCustomerId = customerId;
      await this.clientRepo.save(client);
      this.logger.log(`Stripe Customer ${customerId} created for client ${client.id}`);
    }

    // Ephemeral key grants the mobile SDK temporary access to the Customer object
    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2024-04-10' },
    );

    const setupIntent = await this.stripe.setupIntents.create({
      customer:             customerId,
      payment_method_types: ['card'],
    });

    return {
      setupIntentClientSecret: setupIntent.client_secret!,
      ephemeralKey:            ephemeralKey.secret!,
      customerId,
    };
  }

  // ── GET /payments/payment-methods ─────────────────────────────────────────────
  /**
   * Lists all saved cards for the client's Stripe Customer.
   */
  async getPaymentMethods(clientUserId: string): Promise<SavedCard[]> {
    const client = await this.clientRepo.findOne({ where: { userId: clientUserId } });
    if (!client) throw new NotFoundException('Client profile not found');
    if (!client.stripeCustomerId) return [];

    const methods = await this.stripe.paymentMethods.list({
      customer: client.stripeCustomerId,
      type:     'card',
    });

    return methods.data.map((pm) => ({
      id:       pm.id,
      brand:    pm.card?.brand    ?? 'unknown',
      last4:    pm.card?.last4    ?? '????',
      expMonth: pm.card?.exp_month ?? 0,
      expYear:  pm.card?.exp_year  ?? 0,
    }));
  }

  // ── DELETE /payments/payment-methods/:id ──────────────────────────────────────
  /**
   * Detaches (removes) a saved card from the client's Stripe Customer.
   */
  async detachPaymentMethod(clientUserId: string, paymentMethodId: string): Promise<void> {
    const client = await this.clientRepo.findOne({ where: { userId: clientUserId } });
    if (!client) throw new NotFoundException('Client profile not found');

    // Verify ownership before detaching
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== client.stripeCustomerId) {
      throw new ForbiddenException('Payment method does not belong to this customer');
    }

    await this.stripe.paymentMethods.detach(paymentMethodId);
    this.logger.log(`Payment method ${paymentMethodId} detached from client ${client.id}`);
  }

  // ── POST /payments/webhook ────────────────────────────────────────────────────
  /**
   * Handles Stripe webhook events.
   * rawBody must be the unmodified Buffer — parsed JSON breaks the HMAC signature.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: any) {
      this.logger.warn(`Webhook signature failed: ${err.message}`);
      throw new BadRequestException(`Webhook signature verification failed`);
    }

    this.logger.log(`Stripe event received: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await this.onFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.canceled':
        await this.onCanceled(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        // Acknowledge unhandled events — Stripe will retry if we return non-2xx
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  // ── Private event handlers ────────────────────────────────────────────────────

  private async onSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
    const ride = await this.rideRepo.findOne({
      where: { stripePaymentIntentId: intent.id },
    });
    if (!ride) {
      this.logger.warn(`payment_intent.succeeded: no ride for intent ${intent.id}`);
      return;
    }

    ride.paymentStatus = PaymentStatus.PAID;
    await this.rideRepo.save(ride);

    const payload = {
      rideId:        ride.id,
      paymentMethod: 'card' as const,
      paymentStatus: PaymentStatus.PAID,
    };

    // Notify client
    const clientUser = await this.getClientUser(ride.clientId);
    if (clientUser) {
      this.gatewayService.emitToUser(clientUser.id, 'payment_confirmed', payload);
      await this.notificationsService.sendToToken(clientUser.fcmToken, {
        title: 'Payment successful 🎉',
        body:  'Your card payment has been confirmed. Thank you!',
        data:  { rideId: ride.id, event: 'payment_confirmed' },
      });
    }

    // Notify driver
    if (ride.driverId) {
      const driver = await this.driverRepo.findOne({
        where:  { id: ride.driverId },
        select: ['userId'],
      });
      if (driver) {
        this.gatewayService.emitToUser(driver.userId, 'payment_confirmed', payload);
      }
    }

    this.logger.log(`Ride ${ride.id} — card payment succeeded (intent ${intent.id})`);
  }

  private async onFailed(intent: Stripe.PaymentIntent): Promise<void> {
    const ride = await this.rideRepo.findOne({
      where: { stripePaymentIntentId: intent.id },
    });
    if (!ride) return;

    ride.paymentStatus = PaymentStatus.FAILED;
    await this.rideRepo.save(ride);

    const reason =
      intent.last_payment_error?.message ??
      'Your card payment was declined.';

    const clientUser = await this.getClientUser(ride.clientId);
    if (clientUser) {
      this.gatewayService.emitToUser(clientUser.id, 'payment_failed', {
        rideId: ride.id,
        reason,
      });
      await this.notificationsService.sendToToken(clientUser.fcmToken, {
        title: 'Payment failed',
        body:  reason,
        data:  { rideId: ride.id, event: 'payment_failed' },
      });
    }

    this.logger.warn(`Ride ${ride.id} — card payment failed: ${reason}`);
  }

  private async onCanceled(intent: Stripe.PaymentIntent): Promise<void> {
    const ride = await this.rideRepo.findOne({
      where: { stripePaymentIntentId: intent.id },
    });
    if (!ride || ride.paymentStatus === PaymentStatus.PAID) return;

    // Reset so the client can try again
    ride.stripePaymentIntentId = null;
    await this.rideRepo.save(ride);

    this.logger.log(`Ride ${ride.id} — PaymentIntent ${intent.id} was cancelled; reset for retry`);
  }

  // ── Shared helper ─────────────────────────────────────────────────────────────

  private async getClientUser(clientId: string): Promise<User | null> {
    const client = await this.clientRepo.findOne({
      where:  { id: clientId },
      select: ['userId'],
    });
    if (!client) return null;
    return this.userRepo.findOne({
      where:  { id: client.userId },
      select: ['id', 'fcmToken'],
    });
  }
}

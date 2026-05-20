import apiClient from './client';

export interface PaymentIntentResponse {
  clientSecret?:  string;
  amount:         number;  // smallest currency unit (cents)
  currency:       string;  // e.g. "usd"
  /** true when the server confirmed the charge immediately (saved-card flow) */
  autoCharged?:   boolean;
  /** true when 3-D Secure is required; use clientSecret with the Stripe SDK */
  requiresAction?: boolean;
}

export interface SetupIntentResponse {
  setupIntentClientSecret: string;
  ephemeralKey:            string;
  customerId:              string;
}

export interface SavedPaymentMethod {
  id:       string;
  brand:    string;   // e.g. "visa", "mastercard"
  last4:    string;
  expMonth: number;
  expYear:  number;
}

export const paymentsApi = {
  /**
   * Creates (or retrieves an existing) Stripe PaymentIntent for a completed ride.
   *
   * • Without savedPaymentMethodId → returns { clientSecret } for the payment sheet.
   * • With savedPaymentMethodId    → auto-confirms server-side.
   *   Returns { autoCharged: true } on immediate success, or
   *   { clientSecret, requiresAction: true } when 3-D Secure is needed.
   */
  createIntent: (rideId: string, savedPaymentMethodId?: string) =>
    apiClient.post<PaymentIntentResponse>('/payments/create-intent', {
      rideId,
      ...(savedPaymentMethodId ? { savedPaymentMethodId } : {}),
    }),

  /**
   * Creates a Stripe SetupIntent + Ephemeral Key so the app can save a card
   * to the client's Stripe Customer via the Stripe payment sheet.
   */
  createSetupIntent: () =>
    apiClient.post<SetupIntentResponse>('/payments/setup-intent'),

  /**
   * Returns the list of saved cards for the authenticated client.
   */
  getPaymentMethods: () =>
    apiClient.get<SavedPaymentMethod[]>('/payments/payment-methods'),

  /**
   * Permanently removes a saved card from the client's Stripe Customer.
   */
  detachPaymentMethod: (paymentMethodId: string) =>
    apiClient.delete(`/payments/payment-methods/${paymentMethodId}`),
};

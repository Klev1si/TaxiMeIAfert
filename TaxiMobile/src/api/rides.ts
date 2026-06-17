import apiClient from './client';
import type { NearestDriver, Ride, RideStop } from '../types/api';

// Public live-tracking URL — passenger taps "Share trip" → backend issues a
// token → we wrap it in this URL for the share sheet. The track page is
// hosted on the existing GitHub Pages site that already serves the legal
// pages, so no extra hosting is needed.
export const TRIP_SHARE_BASE_URL = 'https://klev1si.github.io/TaxiMeIAfert/legal/track.html';

export type VehicleType = 'economy' | 'comfort' | 'xl';

export interface FareEstimate {
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number | null;
  breakdown: {
    baseFare: number;
    perKmRate: number;
    perMinuteRate: number;
    minimumFare: number;
    surgeMultiplier: number;
  } | null;
  /** Name of the tariff that was applied (null when no tariff is configured) */
  tariffName: string | null;
  /** Vehicle type used for this estimate (null = any) */
  vehicleType: VehicleType | null;
  /** True when the selected tariff is a night tariff active right now */
  isNightTariff: boolean;
  /** Current surge multiplier (1.0 = no surge) */
  surgeMultiplier: number;
  /** Convenience flag: true when surgeMultiplier > 1 */
  surgeActive: boolean;
}

export interface RideStopInput {
  lat: number;
  lng: number;
  address?: string;
}

export interface RequestRidePayload {
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  dropoffAddress?: string;
  radiusKm?: number;
  /** ISO-8601 timestamp for a scheduled ride (at least 10 min in the future). Omit for immediate. */
  scheduledAt?: string;
  /** Optional promo/discount code. */
  promoCode?: string;
  /** Preferred vehicle type. Omit to accept any available driver. */
  vehicleType?: VehicleType;
  /** Optional intermediate stops between pickup and dropoff. Up to 5. */
  stops?: RideStopInput[];
  /** Optional — dispatch directly to a specific saved/favorite driver. */
  preferredDriverId?: string;
}

export interface PromoValidation {
  valid: boolean;
  code: string;
  description: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxDiscountAmount: number | null;
  minimumFare: number | null;
  expiresAt: string | null;
  usesRemaining: number | null;
  discountAmount: number | null;
}

export interface RateRidePayload {
  rating: number;  // 1–5
  review?: string;
}

export interface CancelRidePayload {
  reason?: string;
}

export interface DriverRatings {
  average:   number | null;
  total:     number;
  /** Keys '1'–'5', values = count of rides with that star rating */
  breakdown: Record<string, number>;
  recent: Array<{
    rating:        number;
    review:        string | null;
    pickupAddress: string | null;
    completedAt:   string | null;
  }>;
}

export const ridesApi = {
  /** GET /rides/estimate — fare estimate before booking */
  getFareEstimate: (
    pickupLat: number, pickupLng: number,
    dropoffLat: number, dropoffLng: number,
    vehicleType?: VehicleType,
  ) =>
    apiClient.get<FareEstimate>('/rides/estimate', {
      params: { pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleType },
    }),

  /** GET /rides/nearest-drivers */
  getNearestDrivers: (lat: number, lng: number, radius = 5, limit = 10, vehicleType?: VehicleType) =>
    apiClient.get<NearestDriver[]>('/rides/nearest-drivers', {
      params: { lat, lng, radius, limit, vehicleType },
    }),

  /** GET /rides/:id — fetch any ride the caller owns (works for completed/cancelled too) */
  getRideById: (rideId: string) =>
    apiClient.get<Ride>(`/rides/${rideId}`),

  /** GET /rides/active — returns the caller's active ride or null (used on app restart) */
  getActiveRide: () =>
    apiClient.get<Ride | null>('/rides/active'),

  /** GET /rides/history — paginated ride history for the current user */
  getRideHistory: (page = 1, limit = 20) =>
    apiClient.get<Ride[]>('/rides/history', { params: { page, limit } }),

  /** POST /rides/request */
  requestRide: (payload: RequestRidePayload) =>
    apiClient.post<Ride>('/rides/request', payload),

  /** POST /rides/:id/accept */
  acceptRide: (rideId: string) =>
    apiClient.post<Ride>(`/rides/${rideId}/accept`),

  /** POST /rides/:id/decline */
  declineRide: (rideId: string) =>
    apiClient.post<{ message: string }>(`/rides/${rideId}/decline`),

  /** POST /rides/:id/en-route */
  markEnRoute: (rideId: string) =>
    apiClient.post<Ride>(`/rides/${rideId}/en-route`),

  /** POST /rides/:id/arrived */
  markArrived: (rideId: string) =>
    apiClient.post<Ride>(`/rides/${rideId}/arrived`),

  /** POST /rides/:id/start */
  startRide: (rideId: string) =>
    apiClient.post<Ride>(`/rides/${rideId}/start`),

  /** POST /rides/:id/complete */
  completeRide: (rideId: string, payload?: { distanceKm?: number; durationMinutes?: number; totalFare?: number }) =>
    apiClient.post<Ride>(`/rides/${rideId}/complete`, payload ?? {}),

  /**
   * PATCH /rides/:id/fare — Driver fixes the total fare on a completed (or
   * stuck-in-progress) ride. Re-credits the driver's wallet so they don't lose
   * earnings when the original completion saved a wrong/zero fare.
   */
  editFare: (rideId: string, payload: { totalFare: number; distanceKm?: number; durationMinutes?: number }) =>
    apiClient.patch<Ride>(`/rides/${rideId}/fare`, payload),

  /**
   * POST /rides/:id/no-show
   * Driver reports passenger didn't show up → fee charged to client.
   * Client reports driver never arrived → free cancellation.
   */
  reportNoShow: (rideId: string) =>
    apiClient.post<Ride>(`/rides/${rideId}/no-show`),

  /**
   * GET /rides/:id/cancellation-fee
   * Preview the fee the client would owe if they cancel right now.
   * Returns { fee, isFree, reason } — call this before showing the cancel modal.
   */
  getCancellationFee: (rideId: string) =>
    apiClient.get<{ fee: number; isFree: boolean; reason: string }>(
      `/rides/${rideId}/cancellation-fee`,
    ),

  /** POST /rides/:id/cancel */
  cancelRide: (rideId: string, payload?: CancelRidePayload) =>
    apiClient.post<Ride>(`/rides/${rideId}/cancel`, payload ?? {}),

  /** POST /rides/:id/share-token — issue (or return existing) public tracking token */
  createShareToken: (rideId: string) =>
    apiClient.post<{ token: string }>(`/rides/${rideId}/share-token`),

  /** POST /rides/:id/pay-cash */
  confirmCashPayment: (rideId: string) =>
    apiClient.post<Ride>(`/rides/${rideId}/pay-cash`),

  /** POST /rides/:id/rate */
  rateRide: (rideId: string, payload: RateRidePayload) =>
    apiClient.post<Ride>(`/rides/${rideId}/rate`, payload),

  /** GET /rides/ratings — driver's rating breakdown (DRIVER only) */
  getRatings: () =>
    apiClient.get<DriverRatings>('/rides/ratings'),

  /**
   * POST /payments/create-intent — create (or retrieve) a Stripe PaymentIntent.
   * Returns { clientSecret, amount (cents), currency } for use with the Stripe SDK.
   */
  createPaymentIntent: (rideId: string) =>
    apiClient.post<{ clientSecret: string; amount: number; currency: string }>(
      '/payments/create-intent',
      { rideId },
    ),

  /**
   * GET /rides/validate-promo?code=XXX&fare=12.50
   * Validates a promo code and optionally previews the discount amount.
   */
  validatePromo: (params: { code: string; fare?: string }) =>
    apiClient.get<PromoValidation>('/rides/validate-promo', { params }),

  /** POST /rides/:id/stops/:stopId/reached — driver marks an intermediate stop as reached */
  markStopReached: (rideId: string, stopId: string) =>
    apiClient.post<RideStop>(`/rides/${rideId}/stops/${stopId}/reached`),
};

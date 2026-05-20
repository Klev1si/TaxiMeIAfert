export class RideStopResponseDto {
  id: string;
  sortOrder: number;
  lat: number;
  lng: number;
  address: string | null;
  reachedAt: Date | null;
}

export class RideResponseDto {
  id: string;
  status: string;
  clientId: string;
  driverId: string | null;
  companyId: string | null;
  tariffId: string | null;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffAddress: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  pickupArrivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  paymentStatus: string;
  // ── Trip metrics ──────────────────────────────────────────────────────────────
  distanceKm: number | null;
  durationMinutes: number | null;
  // ── Fare breakdown ────────────────────────────────────────────────────────────
  baseFare: number | null;
  distanceFare: number | null;
  timeFare: number | null;
  totalFare: number | null;
  // ── Ratings ───────────────────────────────────────────────────────────────────
  clientRating: number | null;
  clientReview: string | null;
  driverRating: number | null;
  driverReview: string | null;
  // ── Scheduled ride ────────────────────────────────────────────────────────────
  scheduledAt: Date | null;
  // ── Promo code ────────────────────────────────────────────────────────────────
  promoCode: string | null;
  discountAmount: number | null;
  // ── Cancellation ──────────────────────────────────────────────────────────────
  cancellationFee: number | null;
  // ── No-show ───────────────────────────────────────────────────────────────────
  /** 'driver' = passenger no-show; 'client' = driver no-show; null = not a no-show */
  noShowReportedBy: string | null;
  // ── Intermediate stops ────────────────────────────────────────────────────────
  stops: RideStopResponseDto[];
}

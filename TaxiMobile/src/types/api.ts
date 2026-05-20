// ── Auth ─────────────────────────────────────────────────────────────────────
export type UserRole = 'client' | 'driver' | 'company' | 'super_admin';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
}

// ── Ride Stops ────────────────────────────────────────────────────────────────
export interface RideStop {
  id: string;
  sortOrder: number;
  lat: number;
  lng: number;
  address: string | null;
  reachedAt: string | null;
}

// ── Rides ─────────────────────────────────────────────────────────────────────
export type RideStatus =
  | 'requested'
  | 'accepted'
  | 'driving_to_pickup'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface NearestDriver {
  driverId: string;
  distanceKm: number;
  lat: number;
  lng: number;
  firstName: string;
  lastName: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColor: string | null;
  rating: number;
}

export interface Ride {
  id: string;
  status: RideStatus;
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
  createdAt: string;
  acceptedAt: string | null;
  pickupArrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  paymentStatus: PaymentStatus;
  // Trip metrics
  distanceKm: number | null;
  durationMinutes: number | null;
  // Fare breakdown
  baseFare: number | null;
  distanceFare: number | null;
  timeFare: number | null;
  totalFare: number | null;
  // Ratings
  clientRating: number | null;
  clientReview: string | null;
  driverRating: number | null;
  driverReview: string | null;
  // Scheduled ride
  scheduledAt: string | null;
  // Promo code
  promoCode: string | null;
  discountAmount: number | null;
  // Cancellation / no-show
  cancellationFee?: number | null;
  /** 'driver' = passenger no-show; 'client' = driver no-show; null = not a no-show */
  noShowReportedBy?: string | null;
  // Intermediate stops
  stops: RideStop[];
}

// ── GPS ───────────────────────────────────────────────────────────────────────
export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  ts: number;
}

// ── WebSocket events (inbound) ────────────────────────────────────────────────
export interface WsRideRequest {
  rideId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffAddress: string | null;
  stops?: RideStop[];
}

export interface WsStopReached {
  rideId: string;
  stopId: string;
  sortOrder: number;
  reachedAt: string;
}

export interface WsRideAccepted {
  rideId: string;
  driverId: string;
  driverName: string;
  vehicleMake: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor: string | null;
}

export interface WsRideCancelled {
  rideId: string;
  cancelledBy: 'client' | 'driver';
  reason: string | null;
}

export interface WsRideRated {
  rideId: string;
  ratedBy: 'client' | 'driver';
  rating: number;
  newAvgRating?: number;
}

export interface WsPaymentConfirmed {
  rideId: string;
  paymentMethod: 'cash' | 'card';
  paymentStatus: 'paid';
}

export interface WsDriverLocationUpdate {
  driverId: string;
  lat: number;
  lng: number;
  ts: number;
  etaMinutes: number | null;
}

export interface WsRideMessage {
  rideId: string;
  text: string;
  fromRole: 'client' | 'driver';
  ts: number;
}

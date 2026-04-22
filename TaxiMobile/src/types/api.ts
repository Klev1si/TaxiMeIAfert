// ── Auth ─────────────────────────────────────────────────────────────────────
export type UserRole = 'client' | 'driver' | 'company' | 'admin';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
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
  clientRating: number | null;
  clientReview: string | null;
  driverRating: number | null;
  driverReview: string | null;
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
  paymentMethod: 'cash';
  paymentStatus: 'paid';
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'company' | 'driver' | 'client';

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export interface Driver {
  id: string;
  userId: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColor: string | null;
  isApproved: boolean;
  isOnline: boolean;
  rating: number;
  totalRides: number;
  createdAt: string;
}

export interface Client {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  rating: number;
  totalRides: number;
  createdAt: string;
}

export interface Company {
  id: string;
  userId: string;
  name: string;
  address: string | null;
  city: string | null;
  isApproved: boolean;
  createdAt: string;
}

// ── Rides ─────────────────────────────────────────────────────────────────────
export type RideStatus =
  | 'requested'
  | 'accepted'
  | 'driving_to_pickup'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

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
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  paymentStatus: string;
  driverRating: number | null;
  clientRating: number | null;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export interface DashboardStats {
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  activeDrivers: number;
  pendingDrivers: number;
  totalClients: number;
  totalCompanies: number;
}

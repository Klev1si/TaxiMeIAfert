import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { Ride } from '../types/api';
// (Ride imported above — used for RideDetail params in both history stacks)

// ── Auth stack ────────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string; mode: 'verify' | 'register'; role?: 'client' | 'driver' | 'company' };
  RegisterClient: { phone: string };
  RegisterDriver: { phone: string };
  RegisterCompany: { phone: string };
  ForgotPassword: undefined;
  ResetPassword: { method: 'email' | 'sms'; identifier: string };
};

// Alias used by the new ForgotPassword/ResetPassword screens — same as AuthScreenProps.
export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

// ── Client tab navigator ──────────────────────────────────────────────────────
export type ClientTabParamList = {
  ClientHome: undefined;
  ClientRideHistory: undefined;
  ClientProfile: undefined;
};

// ── Client stack (nested inside ClientHome tab) ───────────────────────────────
export type ClientStackParamList = {
  ClientHomeMain: undefined;
  RideRequest: {
    pickupLat: number;
    pickupLng: number;
    pickupAddress?: string;
    /** Pre-fill the dropoff when navigating from a saved location */
    dropoffLat?: number;
    dropoffLng?: number;
    dropoffAddress?: string;
    /** Dispatch directly to this saved/favorite driver, if specified */
    preferredDriverId?: string;
  };
  ActiveRide: {
    rideId: string;
    /** Driver details passed from the ride_accepted WS event */
    driverName?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehiclePlate?: string;
    vehicleColor?: string | null;
  };
  PayCash: { rideId: string };
  RateRide: { rideId: string; rateTarget: 'driver' };
  RideHistory: undefined;
  RideDetail: { ride: Ride };
  SavedLocations: undefined;
};

// ── Client history tab stack ──────────────────────────────────────────────────
export type ClientHistoryStackParamList = {
  RideHistoryMain: undefined;
  RideDetail: { ride: Ride };
};

// ── Client profile tab stack ──────────────────────────────────────────────────
export type ClientProfileStackParamList = {
  ClientProfileMain: undefined;
  SavedLocations: undefined;
  FavoriteDrivers: undefined;
  ManageCards: undefined;
  Support: undefined;
  SupportTicket: { ticketId: string };
};

// ── Driver profile tab stack ──────────────────────────────────────────────────
export type DriverProfileStackParamList = {
  DriverProfileMain:    undefined;
  DriverSubscription:   undefined;
  DriverTariff:         undefined;
  Support:              undefined;
  SupportTicket:        { ticketId: string };
};

// ── Driver tab navigator ──────────────────────────────────────────────────────
export type DriverTabParamList = {
  DriverHome: undefined;
  DriverRideHistory: undefined;
  /** "Earnings" tab — renamed to use Wallet as the source of truth */
  DriverWallet: undefined;
  DriverExpenses: undefined;
  DriverProfile: undefined;
};

// ── Driver stack ──────────────────────────────────────────────────────────────
export type DriverStackParamList = {
  DriverHomeMain: undefined;
  IncomingRequest: { rideId: string };
  ActiveDriverRide: { rideId: string };
  RateClient: { rideId: string; rateTarget: 'client' };
};

// ── Driver history tab stack ──────────────────────────────────────────────────
export type DriverHistoryStackParamList = {
  RideHistoryMain: undefined;
  RideDetail: { ride: Ride };
};

// ── Admin tab navigator ───────────────────────────────────────────────────────
export type AdminTabParamList = {
  AdminDashboard:  undefined;
  AdminDrivers:    undefined;
  AdminClients:    undefined;
  AdminCompanies:  undefined;
  AdminPromos:     undefined;
  AdminSupport:    undefined;
  AdminProfile:    undefined;
};

export type AdminTabScreenProps<T extends keyof AdminTabParamList> =
  BottomTabScreenProps<AdminTabParamList, T>;

// ── Admin drivers stack (nested inside AdminDrivers tab) ──────────────────────
export type AdminDriverStackParamList = {
  AdminDriversMain:      undefined;
  AdminDriverDocuments:  { driverId: string; driverName: string };
};

export type AdminDriverStackScreenProps<T extends keyof AdminDriverStackParamList> =
  NativeStackScreenProps<AdminDriverStackParamList, T>;

// ── Admin profile stack (nested inside AdminProfile tab) ──────────────────────
export type AdminProfileStackParamList = {
  AdminProfileMain:     undefined;
  AdminPlans:           undefined;
  AdminGlobalTariffs:   undefined;
  AdminPayouts:         undefined;
  AdminAuditLogs:       undefined;
  AdminFraudEvents:     undefined;
};

export type AdminProfileStackScreenProps<T extends keyof AdminProfileStackParamList> =
  NativeStackScreenProps<AdminProfileStackParamList, T>;

// ── Company tab navigator ─────────────────────────────────────────────────────
export type CompanyTabParamList = {
  CompanyDashboard:     undefined;
  CompanyDrivers:       undefined;
  CompanyTariffs:       undefined;
  CompanySubscription:  undefined;
  CompanyProfile:       undefined;
};

export type CompanyTabScreenProps<T extends keyof CompanyTabParamList> =
  BottomTabScreenProps<CompanyTabParamList, T>;

// ── Root stack ────────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Auth:       undefined;
  ClientApp:  undefined;
  DriverApp:  undefined;
  CompanyApp: undefined;
  AdminApp:   undefined;
};

// ── Screen prop helpers ───────────────────────────────────────────────────────
export type AuthScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type ClientTabScreenProps<T extends keyof ClientTabParamList> =
  BottomTabScreenProps<ClientTabParamList, T>;

export type ClientStackScreenProps<T extends keyof ClientStackParamList> =
  NativeStackScreenProps<ClientStackParamList, T>;

export type DriverTabScreenProps<T extends keyof DriverTabParamList> =
  BottomTabScreenProps<DriverTabParamList, T>;

export type DriverStackScreenProps<T extends keyof DriverStackParamList> =
  NativeStackScreenProps<DriverStackParamList, T>;

export type ClientHistoryStackScreenProps<T extends keyof ClientHistoryStackParamList> =
  NativeStackScreenProps<ClientHistoryStackParamList, T>;

export type ClientProfileStackScreenProps<T extends keyof ClientProfileStackParamList> =
  NativeStackScreenProps<ClientProfileStackParamList, T>;

export type DriverHistoryStackScreenProps<T extends keyof DriverHistoryStackParamList> =
  NativeStackScreenProps<DriverHistoryStackParamList, T>;

export type DriverProfileStackScreenProps<T extends keyof DriverProfileStackParamList> =
  NativeStackScreenProps<DriverProfileStackParamList, T>;

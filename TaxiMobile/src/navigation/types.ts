import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { Ride } from '../types/api';

// ── Auth stack ────────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string; mode: 'verify' | 'register'; role?: 'client' | 'driver' };
  RegisterClient: { phone: string };
  RegisterDriver: { phone: string };
};

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
  };
  ActiveRide: { rideId: string };
  PayCash: { rideId: string };
  RateRide: { rideId: string; rateTarget: 'driver' };
  RideHistory: undefined;
};

// ── Driver tab navigator ──────────────────────────────────────────────────────
export type DriverTabParamList = {
  DriverHome: undefined;
  DriverRideHistory: undefined;
  DriverProfile: undefined;
};

// ── Driver stack ──────────────────────────────────────────────────────────────
export type DriverStackParamList = {
  DriverHomeMain: undefined;
  IncomingRequest: { rideId: string };
  ActiveDriverRide: { rideId: string };
  RateClient: { rideId: string; rateTarget: 'client' };
};

// ── Root stack ────────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Auth: undefined;
  ClientApp: undefined;
  DriverApp: undefined;
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

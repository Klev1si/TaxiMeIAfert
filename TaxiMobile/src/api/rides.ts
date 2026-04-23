import apiClient from './client';
import type { NearestDriver, Ride } from '../types/api';

export interface RequestRidePayload {
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  dropoffAddress?: string;
  radiusKm?: number;
}

export interface RateRidePayload {
  rating: number;  // 1–5
  review?: string;
}

export interface CancelRidePayload {
  reason?: string;
}

export const ridesApi = {
  /** GET /rides/nearest-drivers */
  getNearestDrivers: (lat: number, lng: number, radius = 5, limit = 10) =>
    apiClient.get<NearestDriver[]>('/rides/nearest-drivers', {
      params: { lat, lng, radius, limit },
    }),

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
  completeRide: (rideId: string) =>
    apiClient.post<Ride>(`/rides/${rideId}/complete`),

  /** POST /rides/:id/cancel */
  cancelRide: (rideId: string, payload?: CancelRidePayload) =>
    apiClient.post<Ride>(`/rides/${rideId}/cancel`, payload ?? {}),

  /** POST /rides/:id/pay-cash */
  confirmCashPayment: (rideId: string) =>
    apiClient.post<Ride>(`/rides/${rideId}/pay-cash`),

  /** POST /rides/:id/rate */
  rateRide: (rideId: string, payload: RateRidePayload) =>
    apiClient.post<Ride>(`/rides/${rideId}/rate`, payload),
};

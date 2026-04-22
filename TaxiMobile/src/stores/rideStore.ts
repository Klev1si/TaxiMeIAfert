import { create } from 'zustand';
import type { Ride, NearestDriver, WsRideRequest } from '../types/api';

interface RideState {
  // Client state
  activeRide: Ride | null;
  nearestDrivers: NearestDriver[];
  isSearching: boolean;      // waiting for a driver to accept

  // Driver state — incoming request while driver is online
  incomingRequest: WsRideRequest | null;

  // Actions
  setActiveRide: (ride: Ride | null) => void;
  setNearestDrivers: (drivers: NearestDriver[]) => void;
  setIsSearching: (v: boolean) => void;
  setIncomingRequest: (req: WsRideRequest | null) => void;
  clearAll: () => void;
}

export const useRideStore = create<RideState>((set) => ({
  activeRide: null,
  nearestDrivers: [],
  isSearching: false,
  incomingRequest: null,

  setActiveRide: (ride) => set({ activeRide: ride }),
  setNearestDrivers: (drivers) => set({ nearestDrivers: drivers }),
  setIsSearching: (v) => set({ isSearching: v }),
  setIncomingRequest: (req) => set({ incomingRequest: req }),
  clearAll: () =>
    set({
      activeRide: null,
      nearestDrivers: [],
      isSearching: false,
      incomingRequest: null,
    }),
}));

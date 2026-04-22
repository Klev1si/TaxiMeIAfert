import { create } from 'zustand';

interface DriverState {
  isOnline: boolean;
  currentLat: number | null;
  currentLng: number | null;

  setOnline: (v: boolean) => void;
  setLocation: (lat: number, lng: number) => void;
}

export const useDriverStore = create<DriverState>((set) => ({
  isOnline: false,
  currentLat: null,
  currentLng: null,

  setOnline: (v) => set({ isOnline: v }),
  setLocation: (lat, lng) => set({ currentLat: lat, currentLng: lng }),
}));

import { create } from 'zustand';

interface NetworkState {
  /** true = can reach the API server; false = offline / unreachable */
  isOnline: boolean;
  setOnline: (value: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true,
  setOnline: (isOnline) => set({ isOnline }),
}));

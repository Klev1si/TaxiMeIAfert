/**
 * snackbarStore — tiny toast queue for in-app notifications.
 *
 * Foreground FCM messages used to pop an intrusive Alert.alert dialog with
 * "Dismiss" / "View" buttons. Now they push a Snackbar onto this queue,
 * which the global <SnackbarHost /> renders as a non-blocking bottom-toast.
 */
import { create } from 'zustand';

export interface SnackbarItem {
  id:        number;
  title:     string;
  body:      string;
  /** Optional callback fired when the user taps the snackbar. */
  onPress?:  () => void;
  /** Auto-dismiss timeout in ms. Default 5000. */
  durationMs?: number;
}

interface SnackbarState {
  /** Currently-displayed snackbar, if any. */
  current: SnackbarItem | null;
  /** Push a new toast. Replaces any currently-shown one. */
  show: (item: Omit<SnackbarItem, 'id'>) => void;
  /** Dismiss the current toast. */
  dismiss: () => void;
}

let nextId = 1;

export const useSnackbarStore = create<SnackbarState>((set) => ({
  current: null,
  show: (item) => set({
    current: { ...item, id: nextId++ },
  }),
  dismiss: () => set({ current: null }),
}));

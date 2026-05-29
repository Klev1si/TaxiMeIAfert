import apiClient from './client';

export interface FavoriteDriver {
  favoriteId:   string;
  driverId:     string;
  firstName:    string;
  lastName:     string;
  phone:        string | null;
  avatarUrl:    string | null;
  rating:       number | null;
  totalRides:   number;
  vehicleMake:  string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  vehicleColor: string | null;
  isOnline:     boolean;
  lat:          number | null;
  lng:          number | null;
}

// 8-second timeout so a hung server doesn't leave the user on a spinning screen.
const FAV_TIMEOUT = 8000;

export const clientFavoritesApi = {
  /** GET /client/favorites — list saved drivers */
  list: () =>
    apiClient.get<FavoriteDriver[]>('/client/favorites', { timeout: FAV_TIMEOUT }),

  /** POST /client/favorites/:driverId — save a driver (idempotent) */
  add: (driverId: string) =>
    apiClient.post<{ favoriteId: string }>(`/client/favorites/${driverId}`, undefined, { timeout: FAV_TIMEOUT }),

  /** DELETE /client/favorites/:driverId — remove from saved drivers */
  remove: (driverId: string) =>
    apiClient.delete(`/client/favorites/${driverId}`, { timeout: FAV_TIMEOUT }),
};

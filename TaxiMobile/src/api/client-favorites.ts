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

export const clientFavoritesApi = {
  /** GET /client/favorites — list saved drivers */
  list: () => apiClient.get<FavoriteDriver[]>('/client/favorites'),

  /** POST /client/favorites/:driverId — save a driver (idempotent) */
  add: (driverId: string) =>
    apiClient.post<{ favoriteId: string }>(`/client/favorites/${driverId}`),

  /** DELETE /client/favorites/:driverId — remove from saved drivers */
  remove: (driverId: string) =>
    apiClient.delete(`/client/favorites/${driverId}`),
};

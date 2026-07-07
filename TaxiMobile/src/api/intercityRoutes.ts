import apiClient from './client';

export interface IntercityRoute {
  id:            string;
  ownerType:     'driver' | 'company';
  ownerId:       string;
  fromCity:      string;
  fromLat:       number;
  fromLng:       number;
  fromRadiusKm:  number;
  toCity:        string;
  toLat:         number;
  toLng:         number;
  toRadiusKm:    number;
  flatFare:      number;
  bidirectional: boolean;
  isActive:      boolean;
  createdAt:     string;
  updatedAt:     string;
}

export interface IntercityRouteInput {
  fromCity:      string;
  fromLat:       number;
  fromLng:       number;
  fromRadiusKm?: number;
  toCity:        string;
  toLat:         number;
  toLng:         number;
  toRadiusKm?:   number;
  flatFare:      number;
  bidirectional?: boolean;
}

export const intercityRoutesApi = {
  listMine:  ()               => apiClient.get<IntercityRoute[]>('/intercity-routes/mine'),
  create:    (dto: IntercityRouteInput) => apiClient.post<IntercityRoute>('/intercity-routes', dto),
  update:    (id: string, patch: Partial<IntercityRouteInput> & { isActive?: boolean }) =>
    apiClient.patch<IntercityRoute>(`/intercity-routes/${id}`, patch),
  remove:    (id: string) => apiClient.delete<{ ok: boolean }>(`/intercity-routes/${id}`),
};

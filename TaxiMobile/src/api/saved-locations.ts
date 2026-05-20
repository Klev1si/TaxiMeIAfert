import apiClient from './client';

export interface SavedLocation {
  id: string;
  label: string;
  address: string | null;
  lat: number;
  lng: number;
  createdAt: string;
}

export const savedLocationsApi = {
  /** GET /saved-locations */
  list: () =>
    apiClient.get<SavedLocation[]>('/saved-locations'),

  /** POST /saved-locations */
  create: (payload: { label: string; address?: string; lat: number; lng: number }) =>
    apiClient.post<SavedLocation>('/saved-locations', payload),

  /** PATCH /saved-locations/:id */
  update: (id: string, payload: { label?: string; address?: string | null; lat?: number; lng?: number }) =>
    apiClient.patch<SavedLocation>(`/saved-locations/${id}`, payload),

  /** DELETE /saved-locations/:id */
  remove: (id: string) =>
    apiClient.delete(`/saved-locations/${id}`),
};

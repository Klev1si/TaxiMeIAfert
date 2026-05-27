import apiClient from './client';

export type VehicleType = 'standard' | 'premium' | 'xl' | 'eco' | string;

export interface DriverTariff {
  id:              string;
  name:            string;
  baseFare:        number;
  perKmRate:       number;
  perMinuteRate:   number;
  minimumFare:     number;
  surgeMultiplier: number;
  isNightTariff:   boolean;
  nightStartHour:  number | null;
  nightEndHour:    number | null;
  vehicleType:     VehicleType | null;
  isActive:        boolean;
}

export interface DriverTariffUpsertPayload {
  name:            string;
  baseFare:        number;
  perKmRate:       number;
  perMinuteRate:   number;
  minimumFare:     number;
  surgeMultiplier?: number;
  isNightTariff?:   boolean;
  nightStartHour?:  number;
  nightEndHour?:    number;
  vehicleType?:     VehicleType;
}

export const driverTariffApi = {
  /** GET /driver/tariff — list this driver's personal tariffs (usually 0 or 1) */
  list: () => apiClient.get<DriverTariff[]>('/driver/tariff'),

  /** PUT /driver/tariff — create or replace the driver's tariff (solo drivers only) */
  upsert: (payload: DriverTariffUpsertPayload) =>
    apiClient.put<DriverTariff>('/driver/tariff', payload),

  /** DELETE /driver/tariff/:id — deactivate a tariff (solo drivers only) */
  deactivate: (id: string) =>
    apiClient.delete(`/driver/tariff/${id}`),
};

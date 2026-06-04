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

export interface ActiveDriverTariff extends DriverTariff {
  /** Who set this tariff — 'personal' (solo driver), 'company', or 'global' (admin). */
  source: 'personal' | 'company' | 'global';
}

export const driverTariffApi = {
  /** GET /driver/tariff — list this driver's personal tariffs (usually 0 or 1) */
  list: () => apiClient.get<DriverTariff[]>('/driver/tariff'),

  /** GET /driver/tariff/active — the tariff that would apply right now */
  getActive: () => apiClient.get<ActiveDriverTariff | null>('/driver/tariff/active'),

  /** PUT /driver/tariff — create or replace the driver's tariff (solo drivers only) */
  upsert: (payload: DriverTariffUpsertPayload) =>
    apiClient.put<DriverTariff>('/driver/tariff', payload),

  /** DELETE /driver/tariff/:id — deactivate a tariff (solo drivers only) */
  deactivate: (id: string) =>
    apiClient.delete(`/driver/tariff/${id}`),
};

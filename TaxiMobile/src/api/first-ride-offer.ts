import apiClient from './client';

/** The admin-configured first-ride offer and whether this passenger gets it. */
export interface FirstRideOffer {
  enabled:     boolean;
  /** 1–100; 100 means the first ride is free. */
  discountPct: number;
  /** Max trip distance (km) that counts as "inside the city". */
  maxKm:       number;
  /** True when the passenger's next ride would get the offer. */
  eligible:    boolean;
}

export const firstRideOfferApi = {
  /** GET /first-ride-offer (passengers only) */
  get: () => apiClient.get<FirstRideOffer>('/first-ride-offer'),
};

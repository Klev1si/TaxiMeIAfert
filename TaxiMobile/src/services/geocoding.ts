/**
 * Geocoding service — backed by Nominatim (OpenStreetMap).
 *
 * Used for:
 *   1. Reverse-geocoding a lat/lng pair into a human-readable address
 *      (so the UI shows "Bulevardi Bill Klinton" instead of
 *      "42.66345, 21.16223").
 *   2. Searching for places by free-text query, biased near a coordinate.
 *   3. Returning POI suggestions near a point for the "what's nearby" UX
 *      on the destination / stop search input.
 *
 * Nominatim usage policy:
 *   - Max 1 request/sec; we debounce search inputs by 500 ms so we're well
 *     under the limit.
 *   - User-Agent must identify the app — set on every request.
 *
 * Each function fails open (returns null/[] on network error) so the caller
 * can fall back to coordinates without bricking the UI.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const UA = 'TaxiApp/1.0 (contact@taxiapp.com)';

export interface PlaceResult {
  /** Display name from Nominatim — usually street, neighborhood, city. */
  displayName: string;
  /** Short label suitable for a list row (just the first 1-2 parts). */
  shortLabel:  string;
  lat:         number;
  lng:         number;
  /** Class / type, e.g. "amenity/cafe". Useful for an icon. */
  category?:   string;
}

interface NominatimSearchRaw {
  place_id:     number;
  display_name: string;
  lat:          string;
  lon:          string;
  class?:       string;
  type?:        string;
}

interface NominatimReverseRaw {
  display_name?: string;
  address?: {
    road?:           string;
    pedestrian?:     string;
    suburb?:         string;
    neighbourhood?:  string;
    village?:        string;
    town?:           string;
    city?:           string;
    state?:          string;
    house_number?:   string;
  };
}

/** Build a short, user-friendly label out of a Nominatim result. */
function toShortLabel(raw: NominatimSearchRaw): string {
  // Display name is "<thing>, <area>, <area2>, …" — take the first two parts.
  const parts = raw.display_name.split(',').map(s => s.trim());
  return parts.slice(0, 2).join(', ') || raw.display_name;
}

/** Build a short label from the structured reverse-geocode payload. */
function shortAddressFromReverse(d: NominatimReverseRaw): string | null {
  const a = d.address;
  if (a) {
    const street = a.road ?? a.pedestrian;
    const area   = a.suburb ?? a.neighbourhood ?? a.village ?? a.town ?? a.city ?? null;
    if (street && area)            return `${street}, ${area}`;
    if (street && a.house_number)  return `${a.house_number} ${street}`;
    if (street)                    return street;
    if (area)                      return area;
  }
  if (d.display_name) {
    return d.display_name.split(',').slice(0, 2).map(s => s.trim()).join(', ');
  }
  return null;
}

/**
 * Reverse-geocode a coordinate into a readable address.
 * Returns null on failure so callers can fall back to "lat, lng".
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const url =
      `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}` +
      `&format=json&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal,
    });
    if (!res.ok) return null;
    const json: NominatimReverseRaw = await res.json();
    return shortAddressFromReverse(json);
  } catch {
    return null;
  }
}

/**
 * Free-text place search, biased toward (biasLat, biasLng). The bias is a
 * 10 km viewbox around the point — results outside the box are still
 * returned (Nominatim's `bounded=0`) but ranked lower than near matches.
 */
export async function searchPlaces(
  query:    string,
  biasLat?: number,
  biasLng?: number,
  signal?:  AbortSignal,
): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    let url =
      `${NOMINATIM_BASE}/search` +
      `?q=${encodeURIComponent(q)}` +
      `&format=json&limit=8&addressdetails=0`;
    if (biasLat != null && biasLng != null) {
      // ~10 km box around the bias point — enough to favor in-city results
      // without filtering out a nearby town's same-named street.
      const d = 0.09;
      url +=
        `&viewbox=${biasLng - d},${biasLat + d},${biasLng + d},${biasLat - d}` +
        `&bounded=0`;
    }
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal,
    });
    if (!res.ok) return [];
    const json: NominatimSearchRaw[] = await res.json();
    return json.map(r => ({
      displayName: r.display_name,
      shortLabel:  toShortLabel(r),
      lat:         parseFloat(r.lat),
      lng:         parseFloat(r.lon),
      category:    r.class && r.type ? `${r.class}/${r.type}` : r.class,
    }));
  } catch {
    return [];
  }
}

/** Quick-suggestion categories shown when the search input is empty. */
export interface CategoryChip {
  /** Short slug used in the search term. */
  slug:  string;
  /** Display emoji. */
  icon:  string;
  /** Display label. */
  label: string;
}

export const NEARBY_CATEGORIES: CategoryChip[] = [
  { slug: 'restaurant', icon: '🍽',  label: 'Restaurants' },
  { slug: 'cafe',       icon: '☕',  label: 'Cafes'       },
  { slug: 'supermarket',icon: '🛒',  label: 'Markets'     },
  { slug: 'pharmacy',   icon: '💊',  label: 'Pharmacies'  },
  { slug: 'atm',        icon: '🏧',  label: 'ATMs'        },
  { slug: 'hotel',      icon: '🏨',  label: 'Hotels'      },
  { slug: 'fuel',       icon: '⛽',  label: 'Gas stations'},
  { slug: 'hospital',   icon: '🏥',  label: 'Hospitals'   },
];

/** Fetch POIs near a point belonging to the given category slug. */
export async function nearbyByCategory(
  slug: string,
  lat:  number,
  lng:  number,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  // Nominatim ranks by closeness when we provide a viewbox, even with
  // bounded=1 to actually constrain results.
  const d = 0.05; // ~5 km box
  const url =
    `${NOMINATIM_BASE}/search` +
    `?q=${encodeURIComponent(slug)}` +
    `&format=json&limit=8&addressdetails=0` +
    `&viewbox=${lng - d},${lat + d},${lng + d},${lat - d}` +
    `&bounded=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal,
    });
    if (!res.ok) return [];
    const json: NominatimSearchRaw[] = await res.json();
    return json.map(r => ({
      displayName: r.display_name,
      shortLabel:  toShortLabel(r),
      lat:         parseFloat(r.lat),
      lng:         parseFloat(r.lon),
      category:    r.class && r.type ? `${r.class}/${r.type}` : r.class,
    }));
  } catch {
    return [];
  }
}

/**
 * Google Directions API helper.
 *
 * Fetches a driving route between two points and returns the decoded
 * polyline as an array of { latitude, longitude } coordinates suitable
 * for react-native-maps <Polyline>.
 *
 * Results are cached in memory for CACHE_TTL_MS to avoid hammering the
 * API when the driver moves and the screen re-fetches frequently.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

// ── Polyline decoder ──────────────────────────────────────────────────────────

/**
 * Decodes a Google Maps encoded polyline string into an array of LatLng points.
 * Based on the algorithm at:
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

// ── Haversine distance ────────────────────────────────────────────────────────

/** Returns the great-circle distance in km between two points */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.latitude  - a.latitude)  * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude  * Math.PI) / 180) *
    Math.cos((b.latitude  * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ── In-memory route cache ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  points:    LatLng[];
  expiresAt: number;
}

const routeCache = new Map<string, CacheEntry>();

function cacheKey(origin: LatLng, dest: LatLng): string {
  // Round to 4 decimal places (~11 m) to allow cache hits for tiny moves
  const fmt = (n: number) => n.toFixed(4);
  return `${fmt(origin.latitude)},${fmt(origin.longitude)}->${fmt(dest.latitude)},${fmt(dest.longitude)}`;
}

// ── Main API call ─────────────────────────────────────────────────────────────

/**
 * Fetches a driving route from origin → destination.
 *
 * Returns an empty array if:
 *   - No API key is configured
 *   - The network request fails
 *   - The Directions API returns no routes (e.g., ocean crossing)
 *
 * Results are cached in memory for 5 minutes.
 */
export async function fetchRoute(
  origin: LatLng,
  destination: LatLng,
  apiKey: string,
): Promise<LatLng[]> {
  if (!apiKey) return [];

  const key = cacheKey(origin, destination);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.points;
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving` +
      `&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const json = await response.json() as {
      status: string;
      routes: Array<{ overview_polyline: { points: string } }>;
    };

    if (json.status !== 'OK' || !json.routes.length) return [];

    const points = decodePolyline(json.routes[0].overview_polyline.points);

    routeCache.set(key, { points, expiresAt: Date.now() + CACHE_TTL_MS });
    return points;
  } catch {
    return [];
  }
}

/** Clear all cached routes (call on screen unmount if desired) */
export function clearRouteCache(): void {
  routeCache.clear();
}

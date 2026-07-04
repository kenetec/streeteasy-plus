// Isochrone/geocode cache key + chrome.storage.local wrappers (design doc
// §9), plus a caching decorator around a CommuteProvider (build-plan step 3).

import type {
  CommuteProvider,
  CommuteSettings,
  GeocodedLocation,
  IsochronePolygon,
  LatLng,
  TravelMode,
} from '../types';

const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ISOCHRONE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** `iso:{address}:{minutes}:{mode}`, with the address trimmed + lowercased. */
export function cacheKey(settings: CommuteSettings): string {
  const address = normalizeAddress(settings.workAddress);
  return `iso:${address}:${settings.maxMinutes}:${settings.mode}`;
}

function geocodeCacheKey(address: string): string {
  return `geo:${normalizeAddress(address)}`;
}

export async function getCached<T>(key: string): Promise<T | undefined> {
  const stored = await chrome.storage.local.get(key);
  return stored[key] as T | undefined;
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

async function readCache<T>(key: string, ttlMs: number): Promise<T | undefined> {
  const entry = await getCached<CacheEntry<T>>(key);
  if (!entry) return undefined;
  if (Date.now() - entry.storedAt > ttlMs) return undefined;
  return entry.value;
}

async function writeCache<T>(key: string, value: T): Promise<void> {
  await setCached<CacheEntry<T>>(key, { value, storedAt: Date.now() });
}

function roundCoordinate(value: number | undefined): number {
  return Math.round((value ?? 0) * 1e5) / 1e5;
}

/** Round every [lng, lat] position in a MultiPolygon to 5 decimal places (~1m) to keep storage.local entries small. */
function roundPolygon(polygon: IsochronePolygon): IsochronePolygon {
  return {
    type: 'MultiPolygon',
    coordinates: polygon.coordinates.map((rings) =>
      rings.map((ring) =>
        ring.map((point) => [roundCoordinate(point[0]), roundCoordinate(point[1])])
      )
    ),
  };
}

/**
 * Wraps a CommuteProvider with chrome.storage.local caching: geocode results
 * for 30 days, isochrones for 7 days (design doc §9 — transit schedules
 * drift). A miss or expired entry calls through to `inner`; a rejected
 * `inner` call is never cached, so the next call retries.
 */
export function withCache(inner: CommuteProvider): CommuteProvider {
  return {
    async geocode(address: string): Promise<GeocodedLocation> {
      const key = geocodeCacheKey(address);
      const cached = await readCache<GeocodedLocation>(key, GEOCODE_TTL_MS);
      if (cached) return cached;
      const result = await inner.geocode(address);
      await writeCache(key, result);
      return result;
    },

    async getIsochrone(
      origin: LatLng,
      seconds: number,
      mode: TravelMode
    ): Promise<IsochronePolygon> {
      // Keyed by the geocoded coordinates rather than raw address text: the
      // isochrone only depends on where the address resolved to, not how
      // the user typed it, and repeated calls for the same address share a
      // geocode-cache hit that guarantees identical origin coordinates here.
      const key = cacheKey({
        workAddress: `${origin.lat},${origin.lng}`,
        maxMinutes: seconds / 60,
        mode,
      });
      const cached = await readCache<IsochronePolygon>(key, ISOCHRONE_TTL_MS);
      if (cached) return cached;
      const result = await inner.getIsochrone(origin, seconds, mode);
      const rounded = roundPolygon(result);
      await writeCache(key, rounded);
      return rounded;
    },
  };
}

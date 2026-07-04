// Shared contract across the three isolated extension contexts (popup,
// content script, service worker). Type-only module — no runtime code, so
// esbuild elides it entirely from every bundle.

/** Travel mode supported by the commute provider (Geoapify isoline modes). */
export type TravelMode = 'transit' | 'walk' | 'bicycle' | 'drive';

/** Persisted in chrome.storage.sync under the key 'commuteSettings'. */
export interface CommuteSettings {
  workAddress: string;
  /** Clamped 1–60 in the popup UI. */
  maxMinutes: number;
  mode: TravelMode;
}

/** A resolved lat/lng pair, e.g. from geocoding a work address. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A geocoded location: coordinates plus Geoapify's formatted address string. */
export interface GeocodedLocation extends LatLng {
  formatted: string;
}

/**
 * Isochrone polygon geometry, normalized to GeoJSON MultiPolygon regardless
 * of whether the Geoapify isoline response was a Polygon or MultiPolygon
 * feature (see src/lib/geoapify.ts). Each position is [lng, lat].
 */
export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type IsochronePolygon = GeoJSONMultiPolygon;

// --- Runtime message contract (popup <-> content script <-> background) ---

export interface ApplyFilterMessage {
  type: 'APPLY_FILTER';
  settings: CommuteSettings;
}

export interface ClearFilterMessage {
  type: 'CLEAR_FILTER';
}

export interface GetIsochroneMessage {
  type: 'GET_ISOCHRONE';
  settings: CommuteSettings;
}

/** Messages sent from popup -> content script. */
export type PopupToContentMessage = ApplyFilterMessage | ClearFilterMessage;

/** Messages sent from content script -> background service worker. */
export type ContentToBackgroundMessage = GetIsochroneMessage;

/** Response to GET_ISOCHRONE. */
export type GetIsochroneResponse =
  | { ok: true; polygon: IsochronePolygon }
  | { ok: false; error: string };

// --- Commute provider interface (design doc; implemented in a later step) ---

export interface CommuteProvider {
  geocode(address: string): Promise<GeocodedLocation>;
  getIsochrone(
    origin: LatLng,
    seconds: number,
    mode: TravelMode
  ): Promise<IsochronePolygon>;
  getExactTime?(
    origin: LatLng,
    destination: LatLng,
    mode: TravelMode
  ): Promise<number>;
}

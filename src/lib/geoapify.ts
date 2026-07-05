// Geoapify-backed CommuteProvider (design doc §3, build-plan step 3).
// Geocodes an address, then fetches a transit/drive/walk/bicycle isochrone,
// normalizing both Polygon and MultiPolygon isoline geometry to MultiPolygon
// and polling through Geoapify's 202 "still calculating" deferral.

import type {
  CommuteProvider,
  GeocodedLocation,
  IsochronePolygon,
  LatLng,
  TravelMode,
} from '../types';

const GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search';
const ISOLINE_URL = 'https://api.geoapify.com/v1/isoline';

const POLL_DELAY_MS = 1500;
const MAX_POLL_ATTEMPTS = 3;

interface GeoapifyGeocodeFeature {
  properties: { lat: number; lon: number; formatted: string };
}

interface GeoapifyGeocodeResponse {
  features?: GeoapifyGeocodeFeature[];
  message?: string;
}

interface GeoapifyGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

interface GeoapifyIsolineResponse {
  features?: Array<{ geometry?: GeoapifyGeometry }>;
  properties?: { id?: string };
  message?: string;
}

type IsolineOutcome =
  | { status: 'ok'; body: GeoapifyIsolineResponse }
  | { status: 'pending'; id: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geocodeUrl(address: string, apiKey: string): string {
  const params = new URLSearchParams({ text: address, limit: '1', apiKey });
  return `${GEOCODE_URL}?${params.toString()}`;
}

function isolineUrl(
  origin: LatLng,
  seconds: number,
  mode: TravelMode,
  apiKey: string
): string {
  const params = new URLSearchParams({
    lat: String(origin.lat),
    lon: String(origin.lng),
    type: 'time',
    mode,
    range: String(seconds),
    apiKey,
  });
  return `${ISOLINE_URL}?${params.toString()}`;
}

function isolinePollUrl(id: string, apiKey: string): string {
  const params = new URLSearchParams({ id, apiKey });
  return `${ISOLINE_URL}?${params.toString()}`;
}

async function handleIsolineResponse(
  response: Response
): Promise<IsolineOutcome> {
  if (response.status === 401 || response.status === 403) {
    throw new Error('Geoapify API key is invalid or missing');
  }
  const body = (await response.json().catch(() => undefined)) as
    | GeoapifyIsolineResponse
    | undefined;
  if (response.status === 400) {
    throw new Error(body?.message ?? 'Geoapify request failed');
  }
  if (response.status === 202) {
    const id = body?.properties?.id;
    if (!id) throw new Error('Geoapify request failed with status 202');
    return { status: 'pending', id };
  }
  if (!response.ok) {
    throw new Error(`Geoapify request failed with status ${response.status}`);
  }
  return { status: 'ok', body: body ?? {} };
}

function normalizeGeometry(body: GeoapifyIsolineResponse): IsochronePolygon {
  const geometry = body.features?.[0]?.geometry;
  if (geometry?.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates as number[][][][],
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry ? [geometry.coordinates as number[][][]] : [],
  };
}

/**
 * Builds a CommuteProvider backed by the Geoapify geocode + isoline APIs.
 * `getApiKey` is awaited per request (not a plain string) since MV3 service
 * workers are ephemeral, and this keeps the key injectable in tests.
 */
export function createGeoapifyProvider(
  getApiKey: () => Promise<string | null>
): CommuteProvider {
  async function requireApiKey(): Promise<string> {
    const key = await getApiKey();
    if (!key) {
      throw new Error(
        'No Geoapify API key — create a .env file from .env.example and rebuild'
      );
    }
    return key;
  }

  async function pollIsoline(
    id: string,
    apiKey: string
  ): Promise<IsochronePolygon> {
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      await delay(POLL_DELAY_MS);
      const response = await fetch(isolinePollUrl(id, apiKey));
      const outcome = await handleIsolineResponse(response);
      if (outcome.status === 'ok') return normalizeGeometry(outcome.body);
    }
    throw new Error('Isochrone is taking too long — try again');
  }

  return {
    async geocode(address: string): Promise<GeocodedLocation> {
      const apiKey = await requireApiKey();
      const response = await fetch(geocodeUrl(address, apiKey));
      if (response.status === 401 || response.status === 403) {
        throw new Error('Geoapify API key is invalid or missing');
      }
      const body = (await response.json().catch(() => undefined)) as
        | GeoapifyGeocodeResponse
        | undefined;
      if (response.status === 400) {
        throw new Error(body?.message ?? 'Geoapify request failed');
      }
      if (!response.ok) {
        throw new Error(
          `Geoapify request failed with status ${response.status}`
        );
      }
      const feature = body?.features?.[0];
      if (!feature) {
        throw new Error('Could not find that address');
      }
      return {
        lat: feature.properties.lat,
        lng: feature.properties.lon,
        formatted: feature.properties.formatted,
      };
    },

    async getIsochrone(
      origin: LatLng,
      seconds: number,
      mode: TravelMode
    ): Promise<IsochronePolygon> {
      const apiKey = await requireApiKey();
      const response = await fetch(isolineUrl(origin, seconds, mode, apiKey));
      const outcome = await handleIsolineResponse(response);
      if (outcome.status === 'ok') return normalizeGeometry(outcome.body);
      return pollIsoline(outcome.id, apiKey);
    },
  };
}

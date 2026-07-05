// All StreetEasy-specific DOM selectors and URL shapes live in this file
// (and streeteasy-dom.ts). When StreetEasy's markup drifts, these two files
// plus test/fixtures/search-results.html are the entire blast radius.

import { normalizeListingUrl } from './streeteasy-dom';

export interface ListingGeo {
  /** Normalized with the same normalizeListingUrl used for DOM cards. */
  listingUrl: string;
  lat: number;
  lng: number;
  /** The JSON-LD "name" — a display address, e.g. "420 East 102nd Street #1L". */
  displayName: string;
}

function collectNodes(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const graph = (parsed as Record<string, unknown>)['@graph'];
    if (Array.isArray(graph)) return graph;
    return [parsed];
  }
  return [];
}

function isApartment(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  if (typeof type === 'string') return type === 'Apartment';
  if (Array.isArray(type)) return type.includes('Apartment');
  return false;
}

/**
 * Reads every `<script type="application/ld+json">` block in `doc` and
 * returns a map of normalized listing url -> geo/display info for every
 * `Apartment` node with finite `geo.latitude`/`geo.longitude` and a
 * `url` that normalizes successfully. A script's `@graph` also contains
 * non-listing nodes (Organization, Event, ...) — those are excluded by
 * `@type`, not by whether they happen to carry a `geo` field.
 *
 * Scripts that fail to parse as JSON are skipped, not thrown. Duplicate
 * urls: the last node wins.
 */
export function extractListingGeo(doc: Document): Map<string, ListingGeo> {
  const result = new Map<string, ListingGeo>();

  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }

    for (const node of collectNodes(parsed)) {
      if (!node || typeof node !== 'object') continue;
      const record = node as Record<string, unknown>;
      if (!isApartment(record)) continue;

      const geo = record.geo as Record<string, unknown> | undefined;
      const lat = geo?.latitude;
      const lng = geo?.longitude;
      if (typeof lat !== 'number' || !Number.isFinite(lat)) continue;
      if (typeof lng !== 'number' || !Number.isFinite(lng)) continue;

      if (typeof record.url !== 'string') continue;
      const listingUrl = normalizeListingUrl(record.url);
      if (!listingUrl) continue;

      const displayName = typeof record.name === 'string' ? record.name : '';
      result.set(listingUrl, { listingUrl, lat, lng, displayName });
    }
  }

  return result;
}

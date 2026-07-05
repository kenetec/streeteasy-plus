// Joins DOM-discovered cards to their JSON-LD geo entries. Deliberately
// StreetEasy-agnostic — see streeteasy-dom.ts and streeteasy-jsonld.ts for
// all site-specific parsing.

import type { LatLng } from '../lib/geometry';
import type { DiscoveredCard } from './streeteasy-dom';
import type { ListingGeo } from './streeteasy-jsonld';

export interface LocatedCard extends LatLng {
  element: Element;
  listingUrl: string;
}

/**
 * Joins `cards` to `geo` by normalized listing url. Unmatched cards are
 * returned (not dropped) — the future filtering step must render them as
 * "unknown", never silently hide them.
 */
export function matchCardsToGeo(
  cards: DiscoveredCard[],
  geo: Map<string, ListingGeo>
): { located: LocatedCard[]; unmatched: DiscoveredCard[] } {
  const located: LocatedCard[] = [];
  const unmatched: DiscoveredCard[] = [];

  for (const card of cards) {
    const entry = geo.get(card.listingUrl);
    if (entry) {
      located.push({
        element: card.element,
        lat: entry.lat,
        lng: entry.lng,
        listingUrl: card.listingUrl,
      });
    } else {
      unmatched.push(card);
    }
  }

  return { located, unmatched };
}

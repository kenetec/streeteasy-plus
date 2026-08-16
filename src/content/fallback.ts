// Wave 2 of card classification: resolves cards JSON-LD couldn't place.
//
// Field finding driving this PR: StreetEasy's JSON-LD block is a
// server-render snapshot of the initial result set. It's never rewritten
// when the user pans the map or paginates (XHR swaps in new cards
// instead), so in the map-browsing workflow — the primary way people use
// StreetEasy — wave 1 (classify.ts, JSON-LD join) leaves every card
// "unknown". This module geocodes those cards' addresses directly (hitting
// the service worker's 30-day cache + NYC bounding-rect filter for free)
// and upgrades their verdicts in place.
//
// Deps-injected (no chrome APIs here) so this is testable with a fake
// geocode function and no chrome.runtime mock — see content.ts for the
// production wiring (chrome.runtime.sendMessage) and the generation-token
// staleness guard.

import { pointInMultiPolygon, toPosition } from '../lib/geometry';
import type { MultiPolygonCoords } from '../lib/geometry';
import { COMMUTE_ATTR } from './classify';
import { findListingAddress } from './streeteasy-dom';
import type { GeocodeAddressesResult } from '../types';

export interface FallbackDeps {
  geocode(addresses: string[]): Promise<GeocodeAddressesResult>;

  /**
   * True if the wave that kicked off this call has been superseded (a
   * newer Apply, Clear, or observer-triggered re-run started) while
   * awaiting `geocode`. Checked once, right after the await returns and
   * before any stamping — content.ts's re-run already overwrote every
   * card's data-commute attribute (classifyCards is unconditional, see its
   * doc comment), so stamping after that point would clobber a newer
   * wave's verdicts with stale ones. Implemented as an injected predicate
   * (rather than content.ts checking its own token after this function
   * returns) because the check has to happen BEFORE stamping, and stamping
   * happens entirely inside this function — checking staleness only after
   * resolveUnknownCards resolves would always be too late.
   */
  isStale?(): boolean;
}

/**
 * Finds every card currently stamped "unknown" under `doc`, geocodes their
 * (deduplicated) addresses in a single batch, and upgrades each resolved
 * card's `data-commute` to "within"/"beyond" in place. Cards with no
 * extractable address, or whose address fails to geocode (null in the
 * batch result), stay "unknown" — this never throws on a geocode miss.
 *
 * Two staleness guards, both required:
 *  - `element.isConnected`, checked per card right before stamping: the
 *    observer era means StreetEasy can replace a card's DOM node while its
 *    geocode is in flight, and stamping a detached node is silently
 *    useless.
 *  - `deps.isStale()`, checked once after the batch resolves: if a newer
 *    wave already owns the DOM, this discards the ENTIRE result set
 *    without stamping anything, not just the individual cards that moved.
 */
export async function resolveUnknownCards(
  doc: Document,
  polygon: MultiPolygonCoords,
  deps: FallbackDeps
): Promise<void> {
  const unknownCards = [
    ...doc.querySelectorAll(`[${COMMUTE_ATTR}="unknown"]`),
  ];

  const candidates = unknownCards
    .map((element) => ({ element, address: findListingAddress(element) }))
    .filter(
      (
        candidate
      ): candidate is { element: Element; address: { query: string } } =>
        candidate.address !== null
    );

  if (candidates.length === 0) return;

  // Multiple units in one building collapse to the same query after unit
  // stripping (measured on real pages: common) — dedupe before sending so
  // one batch message never asks the same address twice.
  const uniqueQueries = [...new Set(candidates.map((c) => c.address.query))];
  const results = await deps.geocode(uniqueQueries);

  // A newer wave (Apply, Clear, or another observer re-run) started while
  // we were awaiting the batch — it already reclassified the whole
  // document, so these results are for a DOM state that no longer exists.
  // They aren't wasted: the geocodes are still cached server-side for
  // whatever wave runs its own fallback pass next.
  if (deps.isStale?.()) return;

  for (const { element, address } of candidates) {
    if (!element.isConnected) continue;
    const coords = results?.[address.query];
    if (!coords) continue;

    const verdict = pointInMultiPolygon(toPosition(coords), polygon)
      ? 'within'
      : 'beyond';
    element.setAttribute(COMMUTE_ATTR, verdict);
  }
}

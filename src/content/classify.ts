// Classifies discovered listing cards against a commute isochrone by
// setting a data-commute attribute on each. Composes streeteasy-dom.ts and
// streeteasy-jsonld.ts for discovery/extraction — it owns no StreetEasy
// selectors itself. Pure DOM module: no chrome APIs, no logging.

import { pointInMultiPolygon, toPosition } from '../lib/geometry';
import type { MultiPolygonCoords } from '../lib/geometry';
import { discoverCards } from './streeteasy-dom';
import { extractListingGeo } from './streeteasy-jsonld';
import { matchCardsToGeo } from './match';

export type Verdict = 'within' | 'beyond' | 'unknown';
export const COMMUTE_ATTR = 'data-commute';

export interface ClassificationResult {
  within: number;
  beyond: number;
  unknown: number;
}

/**
 * Discovers listing cards in `doc`, joins them to JSON-LD geo data, and
 * sets `data-commute="within"|"beyond"|"unknown"` on each card's element.
 * Unmatched cards are always marked "unknown", never skipped — the design
 * rule is that a card we can't locate must stay visible/identifiable, not
 * silently disappear.
 *
 * The attribute is set unconditionally on every call, overwriting any
 * existing value. That's intentional: idempotency here means "safe to
 * re-run" (e.g. after the user changes settings, which can flip a card's
 * verdict), NOT "skip cards that already have a value". Future
 * MutationObserver work must not add skip-logic that treats an existing
 * data-commute attribute as already final.
 */
export function classifyCards(
  doc: Document,
  polygon: MultiPolygonCoords
): ClassificationResult {
  const cards = discoverCards(doc);
  const geo = extractListingGeo(doc);
  const { located, unmatched } = matchCardsToGeo(cards, geo);

  const result: ClassificationResult = { within: 0, beyond: 0, unknown: 0 };

  for (const card of located) {
    const verdict: 'within' | 'beyond' = pointInMultiPolygon(
      toPosition(card),
      polygon
    )
      ? 'within'
      : 'beyond';
    card.element.setAttribute(COMMUTE_ATTR, verdict);
    result[verdict]++;
  }

  for (const card of unmatched) {
    card.element.setAttribute(COMMUTE_ATTR, 'unknown');
    result.unknown++;
  }

  return result;
}

/**
 * Tallies `data-commute` verdicts directly from the DOM under `root`. Two
 * writers stamp the attribute after Apply — classifyCards (wave 1, JSON-LD)
 * and fallback.ts's resolveUnknownCards (wave 2, geocode fallback), which
 * upgrades some of wave 1's "unknown"s in place — so rather than thread an
 * arithmetic delta between them, the DOM is the single source of truth and
 * this just counts whatever is actually stamped.
 */
export function countVerdicts(root: ParentNode): ClassificationResult {
  const result: ClassificationResult = { within: 0, beyond: 0, unknown: 0 };

  for (const element of root.querySelectorAll(`[${COMMUTE_ATTR}]`)) {
    const verdict = element.getAttribute(COMMUTE_ATTR);
    if (verdict === 'within' || verdict === 'beyond' || verdict === 'unknown') {
      result[verdict]++;
    }
  }

  return result;
}

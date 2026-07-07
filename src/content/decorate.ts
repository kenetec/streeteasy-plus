// Adds/updates/removes the commute badge for classify.ts's verdicts, and
// (clearDecorations) sweeps every injected badge/attribute back out for
// CLEAR_FILTER. Pure DOM module: operates entirely on [data-commute]
// elements set elsewhere — no StreetEasy selectors of its own, no chrome
// APIs, no logging. Dimming "beyond" cards is handled by content.css alone
// (attribute selector, no badge). findListingAnchor is imported (not
// duplicated) from streeteasy-dom.ts, which owns the actual selector.

import { COMMUTE_ATTR } from './classify';
import { findListingAnchor } from './streeteasy-dom';

/**
 * Every badge this extension injects carries this attribute, so
 * clearDecorations can remove all of them with one `[data-commute-badge]`
 * selector regardless of verdict/text.
 */
export const BADGE_ATTR = 'data-commute-badge';

const BADGE_CLASS = 'commute-badge';
const BADGE_UNKNOWN_MODIFIER = 'commute-badge--unknown';

export interface DecorateSettings {
  maxMinutes: number;
}

/**
 * Walks every `[data-commute]` element under `root` and syncs its badge to
 * its current verdict: "within"/"unknown" get exactly one badge (created if
 * absent, updated in place if present); "beyond" loses any badge it has (a
 * card whose verdict flipped from within to beyond on re-Apply must not
 * keep a stale badge — dimming alone is the signal).
 *
 * Idempotent by construction: an existing badge is found by searching the
 * card's subtree for `[data-commute-badge]` and updated rather than
 * duplicated, so calling this repeatedly (e.g. after a settings change) is
 * safe. If a badge already exists somewhere other than where a fresh
 * insertion would place it, it's still just updated in place — this module
 * does not relocate existing badges.
 */
export function decorateCards(
  root: ParentNode,
  settings: DecorateSettings
): void {
  for (const element of root.querySelectorAll(`[${COMMUTE_ATTR}]`)) {
    const verdict = element.getAttribute(COMMUTE_ATTR);
    const existingBadge = element.querySelector(`[${BADGE_ATTR}]`);

    if (verdict === 'within') {
      const badge = existingBadge ?? createBadge(element);
      badge.className = BADGE_CLASS;
      badge.textContent = `≤ ${settings.maxMinutes} min`;
    } else if (verdict === 'unknown') {
      const badge = existingBadge ?? createBadge(element);
      badge.className = `${BADGE_CLASS} ${BADGE_UNKNOWN_MODIFIER}`;
      badge.textContent = 'commute unknown';
    } else {
      existingBadge?.remove();
    }
  }
}

/**
 * Inserts a new badge for `card` and returns it. Preferred placement is
 * directly after the listing address anchor, as a normal-flow element on
 * its own line — this is what keeps the badge out of the photo corner
 * StreetEasy's own overlay buttons ("Enhanced gallery", "3D tour") occupy.
 *
 * The anchor is treated as unusable if it wraps more than just the address
 * text (e.g. it contains the card's photo) — inserting after an anchor
 * like that would place the badge in the middle of unrelated card content
 * rather than under a short address line. `img` presence is a simple,
 * cheap proxy for "this anchor wraps the whole card body".
 *
 * Falls back to appending as the card's last child when there's no anchor,
 * or the anchor is whole-card-shaped. That's graceful degradation (the
 * badge still appears somewhere on the card), not an error path.
 */
function createBadge(card: Element): Element {
  const doc = card.ownerDocument;
  const badge = doc.createElement('span');
  badge.setAttribute(BADGE_ATTR, '');

  const anchor = findListingAnchor(card);
  if (anchor && !anchor.querySelector('img')) {
    anchor.insertAdjacentElement('afterend', badge);
  } else {
    card.appendChild(badge);
  }

  return badge;
}

/**
 * Removes every badge and verdict stamp this extension has added under
 * `root`. This is the ENTIRE cleanup: dimming "beyond" cards is keyed off
 * the [data-commute] attribute in content.css alone (no class, no inline
 * style), so removing the attribute un-dims automatically — do not add an
 * opacity/style reset here, there is nothing to reset.
 *
 * Pure/idempotent: running this on an already-clean document (or one with
 * no badges/attributes at all) is a no-op.
 */
export function clearDecorations(root: ParentNode): void {
  for (const badge of root.querySelectorAll(`[${BADGE_ATTR}]`)) {
    badge.remove();
  }
  for (const card of root.querySelectorAll(`[${COMMUTE_ATTR}]`)) {
    card.removeAttribute(COMMUTE_ATTR);
  }
}

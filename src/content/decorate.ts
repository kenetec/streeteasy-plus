// Adds/updates/removes the commute badge for classify.ts's verdicts. Pure
// DOM module: operates entirely on [data-commute] elements set elsewhere —
// no StreetEasy selectors, no chrome APIs, no logging. Dimming "beyond"
// cards is handled by content.css alone (attribute selector, no badge).

import { COMMUTE_ATTR } from './classify';

/**
 * Contract for the future CLEAR_FILTER cleanup PR: every badge this
 * extension injects carries this attribute, so removal is a single
 * `[data-commute-badge]` selector regardless of verdict/text.
 */
export const BADGE_ATTR = 'data-commute-badge';

const BADGE_CLASS = 'commute-badge';
const BADGE_UNKNOWN_MODIFIER = 'commute-badge--unknown';

export interface DecorateSettings {
  maxMinutes: number;
}

/**
 * Walks every `[data-commute]` element under `root` and syncs its badge to
 * its current verdict: "within"/"unknown" get exactly one badge child
 * (created if absent, updated in place if present); "beyond" loses any
 * badge it has (a card whose verdict flipped from within to beyond on
 * re-Apply must not keep a stale badge — dimming alone is the signal).
 *
 * Idempotent by construction: an existing badge is found via
 * `[data-commute-badge]` and updated rather than duplicated, so calling
 * this repeatedly (e.g. after a settings change) is safe.
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

function createBadge(card: Element): Element {
  const doc = card.ownerDocument;
  const badge = doc.createElement('span');
  badge.setAttribute(BADGE_ATTR, '');
  card.appendChild(badge);
  return badge;
}

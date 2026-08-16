// Minimal on-page status banner (skeleton verification aid — design doc §4).

import { OWNED_ATTR } from './decorate';

const BANNER_ID = 'commute-filter-banner';

export function showBanner(text: string): void {
  const existing = document.getElementById(BANNER_ID);
  if (existing) {
    // Update in place — NEVER remove-and-recreate here. A remove+append
    // pair is itself a childList mutation on document.body, and before
    // this fix that's exactly what fed an infinite loop: the observer
    // (content.ts's callback) re-renders this banner after every
    // reclassification, a naive recreate makes that render count as a
    // "relevant" DOM change, and the observer fires again — reclassify ->
    // decorate -> showBanner -> mutation -> observer -> reclassify ...
    // forever, once per debounce window, with no user input. Only
    // textContent changes, and only when the text actually differs, so an
    // identical re-render (the steady-state case) produces zero DOM
    // mutations. If you're "simplifying" this back to remove-and-recreate,
    // don't — see test/banner.test.ts's quiescence test, which will fail.
    if (existing.textContent !== text) {
      existing.textContent = text;
    }
    return;
  }
  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.setAttribute(OWNED_ATTR, '');
  el.textContent = text;
  document.body.appendChild(el);
}

export function removeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
}

// Content script: runs inside StreetEasy search pages.
//
// On a successful isochrone response, classifies discovered cards via
// classify.ts and records the verdict as each card's data-commute
// attribute. Badging/dimming by that attribute, CLEAR_FILTER cleanup of it,
// and MutationObserver re-runs are separate, later PRs.

import { APPLY_FILTER, CLEAR_FILTER, GET_ISOCHRONE } from '../lib/messages';
import { removeBanner, showBanner } from './banner';
import { classifyCards } from './classify';
import { decorateCards } from './decorate';
import { log } from '../lib/log';
import type { MultiPolygonCoords } from '../lib/geometry';
import type {
  CommuteSettings,
  GetIsochroneMessage,
  GetIsochroneResponse,
  PopupToContentMessage,
} from '../types';

log('content script loaded on', location.pathname);

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as PopupToContentMessage;
  if (message?.type === APPLY_FILTER) {
    log('APPLY_FILTER received', message.settings);
    applyFilter(message.settings);
  } else if (message?.type === CLEAR_FILTER) {
    log('CLEAR_FILTER received');
    clearFilter();
  }
});

// On page load, re-apply any saved filter so the user doesn't have to
// reopen the popup on every search page.
chrome.storage.sync.get('commuteSettings').then((stored) => {
  const { commuteSettings } = stored as { commuteSettings?: CommuteSettings };
  if (commuteSettings) applyFilter(commuteSettings);
});

async function applyFilter(settings: CommuteSettings): Promise<void> {
  // Ask the service worker for the isochrone. In the skeleton this returns
  // a stub error — the visible banner proves the full round trip works:
  // popup -> content script -> service worker -> content script.
  const request: GetIsochroneMessage = { type: GET_ISOCHRONE, settings };
  const response = (await chrome.runtime.sendMessage(
    request
  )) as GetIsochroneResponse | undefined;

  log('received', response);

  if (!response?.ok) {
    const error =
      response && !response.ok ? response.error : 'no response';
    showBanner(
      `Commute filter: ${settings.maxMinutes} min by ${settings.mode} ` +
      `from "${settings.workAddress}" — ${error}`
    );
    return;
  }

  // response.polygon.coordinates is GeoJSON-shaped (see IsochronePolygon in
  // ../types) but typed as plain number[][][][]; MultiPolygonCoords is the
  // same shape with Position ([lng, lat]) tuples, so this narrows the type
  // rather than converting any values.
  const result = classifyCards(
    document,
    response.polygon.coordinates as MultiPolygonCoords
  );
  decorateCards(document, { maxMinutes: settings.maxMinutes });
  log('classified', result);
  // Clears a stale error banner from a previous failed attempt — without
  // this, a successful retry after a failure left the old error visible.
  removeBanner();

  // TODO (later PR): re-run classify/decorate via MutationObserver as new
  // cards render (pagination/infinite scroll).
}

function clearFilter(): void {
  removeBanner();
  // TODO (later PR): remove data-commute attributes and commute-badge
  // elements added by classify.ts / decorate.ts.
}

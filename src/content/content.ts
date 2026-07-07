// Content script: runs inside StreetEasy search pages.
//
// On a successful isochrone response, classifies discovered cards via
// classify.ts and records the verdict as each card's data-commute
// attribute, then badges/dims via decorate.ts. Because StreetEasy is a
// React app, scrolling/map interaction/sorting/pagination replace or add
// card DOM nodes after Apply, wiping our attributes or leaving new cards
// undecorated — so a MutationObserver (observer.ts) re-runs classify+
// decorate whenever that happens. CLEAR_FILTER cleanup of attributes/
// badges is a separate, later PR.

import { APPLY_FILTER, CLEAR_FILTER, GET_ISOCHRONE } from '../lib/messages';
import { removeBanner, showBanner } from './banner';
import { classifyCards } from './classify';
import { decorateCards } from './decorate';
import { startObserving } from './observer';
import type { ObserverHandle } from './observer';
import { findResultsContainer } from './streeteasy-dom';
import { log } from '../lib/log';
import type { MultiPolygonCoords } from '../lib/geometry';
import type {
  CommuteSettings,
  GetIsochroneMessage,
  GetIsochroneResponse,
  PopupToContentMessage,
} from '../types';

interface ActiveFilter {
  polygon: MultiPolygonCoords;
  maxMinutes: number;
}

// Content scripts die with the page — a fresh load re-applies from
// chrome.storage.sync (below) — so module-level state is the correct
// lifetime for "what filter is currently active" between re-renders.
let activeFilter: ActiveFilter | undefined;

// Left accessible via module state (not wired to CLEAR_FILTER) rather than
// disconnected here: the future CLEAR PR owns full teardown (attribute/
// badge sweep + disconnecting this observer) and needs this handle.
let observerHandle: ObserverHandle | undefined;

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
  const polygon = response.polygon.coordinates as MultiPolygonCoords;
  const result = classifyCards(document, polygon);
  decorateCards(document, { maxMinutes: settings.maxMinutes });
  log('classified', result);
  // Replaces any previous banner (including a stale error from a failed
  // attempt — that fix still holds, since showBanner always removes the
  // existing one first) with a low-key confirmation. The resolved address
  // is the user's only signal that geocoding picked the right place; see
  // the incident note on NYC_BOUNDS_RECT in ../lib/geoapify.ts.
  showBanner(`Commute filter active — from ${response.resolvedAddress}`);

  // A subsequent successful Apply (new settings) replaces this state and
  // must not stack a second observer — startFilterObserver disconnects any
  // existing handle before starting a new one.
  activeFilter = { polygon, maxMinutes: settings.maxMinutes };
  startFilterObserver();
}

/**
 * (Re)starts DOM-change observation for the active filter. Idempotent:
 * disconnects any previously running observer first, so calling this again
 * (e.g. on a later successful Apply) never leaves two observers live.
 */
function startFilterObserver(): void {
  observerHandle?.disconnect();

  // findResultsContainer returns null on the current fixture (no stable
  // hook exists — see its doc comment in streeteasy-dom.ts), so this falls
  // back to document.body; the observer's debounce + relevance filter keep
  // body-level observation cheap.
  const target = findResultsContainer(document) ?? document.body;

  observerHandle = startObserving(target, () => {
    if (!activeFilter) return;
    const rerunResult = classifyCards(document, activeFilter.polygon);
    decorateCards(document, { maxMinutes: activeFilter.maxMinutes });
    log('re-classified after DOM change', rerunResult);
  });
}

function clearFilter(): void {
  removeBanner();
  // TODO (later PR): remove data-commute attributes and commute-badge
  // elements added by classify.ts / decorate.ts, and disconnect
  // observerHandle.
}

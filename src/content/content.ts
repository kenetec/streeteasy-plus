// Content script: runs inside StreetEasy search pages.
//
// On a successful isochrone response, classifies discovered cards via
// classify.ts and records the verdict as each card's data-commute
// attribute, then badges/dims via decorate.ts. Because StreetEasy is a
// React app, scrolling/map interaction/sorting/pagination replace or add
// card DOM nodes after Apply, wiping our attributes or leaving new cards
// undecorated — so a MutationObserver (observer.ts) re-runs classify+
// decorate whenever that happens. CLEAR_FILTER tears all of that back down
// (see clearFilter).

import {
  APPLY_FILTER,
  CLEAR_FILTER,
  GEOCODE_ADDRESSES,
  GET_ISOCHRONE,
} from '../lib/messages';
import { removeBanner, showBanner } from './banner';
import { classifyCards, countVerdicts } from './classify';
import type { ClassificationResult } from './classify';
import { clearDecorations, decorateCards } from './decorate';
import { resolveUnknownCards } from './fallback';
import { startObserving } from './observer';
import type { ObserverHandle } from './observer';
import { findResultsContainer } from './streeteasy-dom';
import { formatSummary } from './summary';
import { error as logError, log } from '../lib/log';
import type { MultiPolygonCoords } from '../lib/geometry';
import type {
  CommuteSettings,
  GeocodeAddressesMessage,
  GeocodeAddressesResponse,
  GeocodeAddressesResult,
  GetIsochroneMessage,
  GetIsochroneResponse,
  PopupToContentMessage,
} from '../types';

interface ActiveFilter {
  polygon: MultiPolygonCoords;
  maxMinutes: number;
  // Needed by the observer callback to re-render the banner on every
  // re-classification, not just the initial Apply.
  resolvedAddress: string;
}

// Content scripts die with the page — a fresh load re-applies from
// chrome.storage.sync (below) — so module-level state is the correct
// lifetime for "what filter is currently active" between re-renders.
let activeFilter: ActiveFilter | undefined;

// Module state so clearFilter() can disconnect it (and a later Apply can
// replace it — see startFilterObserver).
let observerHandle: ObserverHandle | undefined;

// Bumped on every wave-1 run (Apply success, CLEAR, and each
// observer-triggered re-run) — see bumpGeneration(). A wave-2 call captures
// the token at the moment it's fired; if the token has moved on by the time
// its geocode batch resolves, a newer wave already owns the DOM and its
// results are discarded unstamped (fallback.ts's isStale dep).
let generationToken = 0;

// Bounds wave-2 concurrency at 1 across the whole module (combined with the
// observer's 250ms debounce): while a wave-2 batch is in flight, a
// subsequent wave-1 run with its own unknowns simply doesn't fire a second
// one. The generation token would discard a superseded wave's results
// anyway, so this isn't a correctness guard — it's here to avoid spending
// redundant geocode credits on a request whose results are thrown away.
let wave2InFlight = false;

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
  // existing one first) with the address + live counts. The resolved
  // address is the user's only signal that geocoding picked the right
  // place; see the incident note on NYC_BOUNDS_RECT in ../lib/geoapify.ts.
  showBanner(formatSummary(response.resolvedAddress, result));

  // A subsequent successful Apply (new settings) replaces this state and
  // must not stack a second observer — startFilterObserver disconnects any
  // existing handle before starting a new one.
  activeFilter = {
    polygon,
    maxMinutes: settings.maxMinutes,
    resolvedAddress: response.resolvedAddress,
  };
  startFilterObserver();

  const generation = bumpGeneration();
  maybeRunWave2(result, polygon, response.resolvedAddress, generation);
}

/**
 * Sends `addresses` to the service worker via GEOCODE_ADDRESSES and
 * unwraps the response into the plain Record fallback.ts's FallbackDeps
 * expects. Throws on `ok: false` (a systemic failure, e.g. missing API
 * key) — resolveUnknownCards doesn't wrap this call in its own try/catch,
 * so the throw propagates up to maybeRunWave2's .catch below, where a
 * failed wave 2 just leaves its candidate cards "unknown" (never crashes
 * wave 1).
 */
async function sendGeocodeAddresses(
  addresses: string[]
): Promise<GeocodeAddressesResult> {
  const request: GeocodeAddressesMessage = {
    type: GEOCODE_ADDRESSES,
    addresses,
  };
  const response = (await chrome.runtime.sendMessage(
    request
  )) as GeocodeAddressesResponse | undefined;

  if (!response?.ok) {
    throw new Error(
      response && !response.ok ? response.error : 'no response'
    );
  }
  return response.results;
}

/**
 * Fires wave 2 (fallback.ts) for a wave-1 result that left some cards
 * "unknown" — see the module-level doc comments on generationToken/
 * wave2InFlight for the concurrency/staleness contracts this relies on.
 * Not awaited by callers: wave 1 must never block on this.
 */
function maybeRunWave2(
  result: ClassificationResult,
  polygon: MultiPolygonCoords,
  resolvedAddress: string,
  generation: number
): void {
  if (result.unknown === 0) return;
  if (wave2InFlight) return;

  wave2InFlight = true;
  resolveUnknownCards(document, polygon, {
    geocode: sendGeocodeAddresses,
    isStale: () => generationToken !== generation,
  })
    .catch((err) => {
      logError('wave 2 (geocode fallback) failed', err);
    })
    .finally(() => {
      wave2InFlight = false;

      // Superseded by a newer wave-1 run while we were awaiting geocodes —
      // that run already rendered its own banner; nothing more to do.
      if (generationToken !== generation) return;

      const recounted = countVerdicts(document);
      log('wave 2 recount', recounted);
      showBanner(formatSummary(resolvedAddress, recounted));
    });
}

/**
 * Bumps and returns the generation token. Called after every wave-1 run
 * (Apply success, CLEAR, each observer-triggered re-run) — including runs
 * that don't themselves fire wave 2 — because classifyCards overwrites
 * every card's data-commute attribute unconditionally on each run. An
 * older, still in-flight wave 2 stamping after a newer wave 1 already
 * reclassified the document would clobber fresh verdicts with stale ones;
 * bumping on every run, not just runs that fire their own wave 2, is what
 * makes the isStale check in maybeRunWave2/resolveUnknownCards catch that.
 */
function bumpGeneration(): number {
  return ++generationToken;
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
    // Captured once, up front: classifyCards/decorateCards/showBanner
    // below are synchronous, so activeFilter can't change mid-callback
    // today — but reading a single snapshot (rather than the module
    // variable at each use) keeps this correct even if that changes, and
    // makes the guard explicit: a filter cleared between the debounce
    // firing and this callback running must never resurrect a banner.
    const current = activeFilter;
    if (!current) return;
    const rerunResult = classifyCards(document, current.polygon);
    decorateCards(document, { maxMinutes: current.maxMinutes });
    log('re-classified after DOM change', rerunResult);
    showBanner(formatSummary(current.resolvedAddress, rerunResult));

    const generation = bumpGeneration();
    maybeRunWave2(
      rerunResult,
      current.polygon,
      current.resolvedAddress,
      generation
    );
  });
}

function clearFilter(): void {
  // Order matters: disconnect the observer BEFORE sweeping. Otherwise the
  // sweep's own DOM mutations (removing badges, stripping attributes) —
  // plus any React activity interleaved with it — could race a final
  // debounced reclassification that reads now-stale activeFilter state.
  // Kill the source, then clean.
  observerHandle?.disconnect();
  observerHandle = undefined;

  activeFilter = undefined;
  // Invalidates any in-flight wave 2 (see bumpGeneration's doc comment) —
  // a cleared filter means no wave owns the DOM anymore, so its results
  // must never land after this point.
  bumpGeneration();

  clearDecorations(document);
  removeBanner();
  log('cleared');
}

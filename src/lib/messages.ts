// Message type constants shared across popup, content script, and
// background contexts, plus the background-side dispatch logic that turns
// a GET_ISOCHRONE request into a response via an injected provider.

import type {
  CommuteProvider,
  CommuteSettings,
  GeocodeAddressesMessage,
  GeocodeAddressesResponse,
  GeocodeAddressesResult,
  GetIsochroneMessage,
  GetIsochroneResponse,
} from '../types';
import { error as logError, log } from './log';

export const APPLY_FILTER = 'APPLY_FILTER' as const;
export const CLEAR_FILTER = 'CLEAR_FILTER' as const;
export const GET_ISOCHRONE = 'GET_ISOCHRONE' as const;
export const GEOCODE_ADDRESSES = 'GEOCODE_ADDRESSES' as const;

function isGetIsochroneMessage(msg: unknown): msg is GetIsochroneMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === GET_ISOCHRONE
  );
}

function isGeocodeAddressesMessage(
  msg: unknown
): msg is GeocodeAddressesMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === GEOCODE_ADDRESSES
  );
}

/**
 * Builds a chrome.runtime.onMessage listener wired to `provider`. Returns
 * `true` for GET_ISOCHRONE to keep the async response channel open; without
 * it the caller receives `undefined` (the most common MV3 messaging bug).
 */
export function createMessageHandler(provider: CommuteProvider) {
  return (
    msg: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ): boolean | undefined => {
    if (isGetIsochroneMessage(msg)) {
      handleGetIsochrone(provider, msg.settings).then(
        (response) => {
          log('isochrone response', {
            settings: msg.settings,
            ok: response.ok,
            zones: response.ok ? response.polygon.coordinates.length : undefined,
            error: response.ok ? undefined : response.error,
          });
          sendResponse(response);
        }
      );
      return true;
    }
    if (isGeocodeAddressesMessage(msg)) {
      handleGeocodeAddresses(provider, msg.addresses).then(sendResponse);
      return true;
    }
    logError('unhandled message', msg);
    return undefined;
  };
}

async function handleGetIsochrone(
  provider: CommuteProvider,
  settings: CommuteSettings
): Promise<GetIsochroneResponse> {
  log('GET_ISOCHRONE received', settings);
  try {
    const origin = await provider.geocode(settings.workAddress);
    const polygon = await provider.getIsochrone(
      origin,
      settings.maxMinutes * 60,
      settings.mode
    );
    return { ok: true, polygon, resolvedAddress: origin.formatted };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Batch-geocodes `addresses` through `provider` via Promise.allSettled — one
 * address failing to resolve (not found in the NYC rect, a 400, ...) maps
 * to `null` for that address and never fails the rest of the batch. Callers
 * are expected to have deduped `addresses` already (fallback.ts does); this
 * doesn't add its own cache layer — `provider` is already the withCache-
 * wrapped one wired in src/background.ts, so repeat addresses across
 * batches/pages are free.
 *
 * `ok: false` is reserved for a systemic failure: a missing/invalid API key
 * fails every geocode call identically (see requireApiKey/geocode in
 * src/lib/geoapify.ts, whose error messages both mention "API key") before
 * any of them even reach the network, so that's surfaced as a single batch
 * error rather than drowned in per-address nulls that would misleadingly
 * read as "none of these addresses exist".
 */
async function handleGeocodeAddresses(
  provider: CommuteProvider,
  addresses: string[]
): Promise<GeocodeAddressesResponse> {
  // The credit-spend observability this PR needs: one line per batch, not
  // per address (Geoapify geocode calls are billed per request).
  log('GEOCODE_ADDRESSES received', { count: addresses.length });

  const settled = await Promise.allSettled(
    addresses.map((address) => provider.geocode(address))
  );

  const apiKeyFailure = settled.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === 'rejected' &&
      outcome.reason instanceof Error &&
      outcome.reason.message.includes('API key')
  );
  if (apiKeyFailure) {
    const reason = apiKeyFailure.reason as Error;
    log('GEOCODE_ADDRESSES batch failed (API key)', reason.message);
    return { ok: false, error: reason.message };
  }

  const results: GeocodeAddressesResult = {};
  settled.forEach((outcome, i) => {
    const address = addresses[i];
    if (address === undefined) return;
    results[address] =
      outcome.status === 'fulfilled'
        ? { lat: outcome.value.lat, lng: outcome.value.lng }
        : null;
  });

  return { ok: true, results };
}

/**
 * Test/dev fixture only — production wiring in src/background.ts uses
 * createGeoapifyProvider instead (build-plan step 3). Both methods reject so
 * handleGetIsochrone's catch produces
 * `{ ok: false, error: 'Isochrone provider not implemented yet' }`.
 */
export const stubProvider: CommuteProvider = {
  geocode() {
    return Promise.reject(new Error('Isochrone provider not implemented yet'));
  },
  getIsochrone() {
    return Promise.reject(new Error('Isochrone provider not implemented yet'));
  },
};

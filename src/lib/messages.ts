// Message type constants shared across popup, content script, and
// background contexts, plus the background-side dispatch logic that turns
// a GET_ISOCHRONE request into a response via an injected provider.

import type {
  CommuteProvider,
  CommuteSettings,
  GetIsochroneMessage,
  GetIsochroneResponse,
} from '../types';

export const APPLY_FILTER = 'APPLY_FILTER' as const;
export const CLEAR_FILTER = 'CLEAR_FILTER' as const;
export const GET_ISOCHRONE = 'GET_ISOCHRONE' as const;

function isGetIsochroneMessage(msg: unknown): msg is GetIsochroneMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === GET_ISOCHRONE
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
      handleGetIsochrone(provider, msg.settings).then(sendResponse);
      return true;
    }
    console.error('[commute-filter] unhandled message', msg);
    return undefined;
  };
}

async function handleGetIsochrone(
  provider: CommuteProvider,
  settings: CommuteSettings
): Promise<GetIsochroneResponse> {
  console.log('[commute-filter] GET_ISOCHRONE received (stub)', settings);
  try {
    const origin = await provider.geocode(settings.workAddress);
    const polygon = await provider.getIsochrone(
      origin,
      settings.maxMinutes * 60,
      settings.mode
    );
    return { ok: true, polygon };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stub provider: current build-plan stage has no real Geoapify integration
 * yet (step 3). Both methods reject so handleGetIsochrone's catch produces
 * the same `{ ok: false, error: 'Isochrone provider not implemented yet' }`
 * response the skeleton always returned.
 */
export const stubProvider: CommuteProvider = {
  geocode() {
    return Promise.reject(new Error('Isochrone provider not implemented yet'));
  },
  getIsochrone() {
    return Promise.reject(new Error('Isochrone provider not implemented yet'));
  },
};

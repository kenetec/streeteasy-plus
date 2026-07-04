// Service worker (MV3): event-driven and short-lived — Chrome starts it on
// demand and kills it after ~30s idle. No in-memory state between events;
// persistence goes through chrome.storage.
//
// Skeleton stage: this only proves the message channel works. The Geoapify
// geocode + isochrone calls land here in build-plan step 3.

import type {
  CommuteSettings,
  GetIsochroneMessage,
  GetIsochroneResponse,
} from './types';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[commute-filter] installed');
});

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if ((msg as { type?: unknown })?.type === 'GET_ISOCHRONE') {
    const { settings } = msg as GetIsochroneMessage;
    handleGetIsochrone(settings).then(sendResponse);
    // Required: keeps the response channel open for the async reply above.
    // Without this, the caller receives `undefined`.
    return true;
  }
});

async function handleGetIsochrone(
  settings: CommuteSettings
): Promise<GetIsochroneResponse> {
  // TODO (step 3): check chrome.storage.local cache -> geocode work address
  // via Geoapify -> fetch isoline -> normalize to MultiPolygon -> cache.
  console.log('[commute-filter] GET_ISOCHRONE received (stub)', settings);
  return { ok: false, error: 'Isochrone provider not implemented yet' };
}

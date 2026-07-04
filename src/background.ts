// Service worker (MV3): event-driven and short-lived — Chrome starts it on
// demand and kills it after ~30s idle. No in-memory state between events;
// persistence goes through chrome.storage.
//
// Skeleton stage: this only proves the message channel works. The Geoapify
// geocode + isochrone calls land here in build-plan step 3.

import { createMessageHandler, stubProvider } from './lib/messages';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[commute-filter] installed');
});

chrome.runtime.onMessage.addListener(createMessageHandler(stubProvider));

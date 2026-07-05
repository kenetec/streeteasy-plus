// Service worker (MV3): event-driven and short-lived — Chrome starts it on
// demand and kills it after ~30s idle. No in-memory state between events;
// persistence goes through chrome.storage.

import { createMessageHandler } from './lib/messages';
import { createGeoapifyProvider } from './lib/geoapify';
import { withCache } from './lib/cache';

async function getApiKey(): Promise<string | null> {
  return __GEOAPIFY_API_KEY__ || null;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[commute-filter] installed');
});

chrome.runtime.onMessage.addListener(
  createMessageHandler(withCache(createGeoapifyProvider(getApiKey)))
);

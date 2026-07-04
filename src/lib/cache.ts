// Isochrone cache key + chrome.storage.local wrappers (design doc §9).
// Caching isn't wired into the request flow yet — that lands with the
// Geoapify provider (build-plan step 3) — but the key format and typed
// storage access are established here now so that step can reuse them.

import type { CommuteSettings } from '../types';

/** `iso:{address}:{minutes}:{mode}`, with the address trimmed + lowercased. */
export function cacheKey(settings: CommuteSettings): string {
  const address = settings.workAddress.trim().toLowerCase();
  return `iso:${address}:${settings.maxMinutes}:${settings.mode}`;
}

export async function getCached<T>(key: string): Promise<T | undefined> {
  const stored = await chrome.storage.local.get(key);
  return stored[key] as T | undefined;
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

import { describe, expect, it, vi } from 'vitest';
import { cacheKey, withCache } from '../src/lib/cache';
import type {
  CommuteProvider,
  CommuteSettings,
  GeocodedLocation,
  IsochronePolygon,
} from '../src/types';

function settings(overrides: Partial<CommuteSettings> = {}): CommuteSettings {
  return {
    workAddress: '350 5th Ave',
    maxMinutes: 30,
    mode: 'transit',
    ...overrides,
  };
}

describe('cacheKey', () => {
  it('has the iso.v2:{address}:{minutes}:{mode} shape', () => {
    expect(cacheKey(settings())).toBe('iso.v2:350 5th ave:30:transit');
  });

  it('normalizes trivially different addresses to the same key', () => {
    const a = cacheKey(settings({ workAddress: '350 5th Ave ' }));
    const b = cacheKey(settings({ workAddress: '350 5th ave' }));
    expect(a).toBe(b);
  });

  it('produces different keys for different minutes', () => {
    const a = cacheKey(settings({ maxMinutes: 30 }));
    const b = cacheKey(settings({ maxMinutes: 45 }));
    expect(a).not.toBe(b);
  });

  it('produces different keys for different modes', () => {
    const a = cacheKey(settings({ mode: 'transit' }));
    const b = cacheKey(settings({ mode: 'walk' }));
    expect(a).not.toBe(b);
  });
});

describe('withCache', () => {
  const geocoded: GeocodedLocation = {
    lat: 40.7484,
    lng: -73.9857,
    formatted: '350 5th Ave, New York, NY',
  };
  const polygon: IsochronePolygon = {
    type: 'MultiPolygon',
    coordinates: [[[[-73.985712345, 40.748412345]]]],
  };

  function fakeInner(overrides: Partial<CommuteProvider> = {}): CommuteProvider {
    return {
      geocode: vi.fn().mockResolvedValue(geocoded),
      getIsochrone: vi.fn().mockResolvedValue(polygon),
      ...overrides,
    };
  }

  it('calls inner once on a miss and stores the result', async () => {
    const inner = fakeInner();
    const provider = withCache(inner);

    const result = await provider.geocode('350 5th Ave');

    expect(inner.geocode).toHaveBeenCalledTimes(1);
    expect(result).toEqual(geocoded);
    const stored = await chrome.storage.local.get('geo.v2:350 5th ave');
    expect(stored['geo.v2:350 5th ave']).toBeDefined();
  });

  it('returns the cached value on a hit without calling inner again', async () => {
    const inner = fakeInner();
    const provider = withCache(inner);

    await provider.geocode('350 5th Ave');
    const result = await provider.geocode('350 5th Ave');

    expect(inner.geocode).toHaveBeenCalledTimes(1);
    expect(result).toEqual(geocoded);
  });

  it('calls inner again once a cached entry has expired', async () => {
    const inner = fakeInner();
    const provider = withCache(inner);

    await provider.geocode('350 5th Ave');
    const key = 'geo.v2:350 5th ave';
    const entry = (await chrome.storage.local.get(key))[key] as {
      value: GeocodedLocation;
      storedAt: number;
    };
    await chrome.storage.local.set({
      [key]: { ...entry, storedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 },
    });

    await provider.geocode('350 5th Ave');

    expect(inner.geocode).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected inner call, so the next call retries', async () => {
    const geocode = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(geocoded);
    const provider = withCache({
      geocode,
      getIsochrone: vi.fn().mockResolvedValue(polygon),
    });

    await expect(provider.geocode('350 5th Ave')).rejects.toThrow('boom');
    const key = 'geo.v2:350 5th ave';
    expect((await chrome.storage.local.get(key))[key]).toBeUndefined();

    const result = await provider.geocode('350 5th Ave');

    expect(geocode).toHaveBeenCalledTimes(2);
    expect(result).toEqual(geocoded);
  });

  it('ignores an old-prefix entry (the poisoned-cache incident this version bump fixes)', async () => {
    // Simulates a pre-fix cached geocode — e.g. the Kansas mis-resolution
    // of "165 1st Ave" — sitting under the old, un-versioned key.
    await chrome.storage.local.set({
      'geo:165 1st ave': {
        value: { lat: 37.5, lng: -98.5, formatted: '165 1st Ave, Hazelton, KS' },
        storedAt: Date.now(),
      },
    });

    const inner = fakeInner();
    const provider = withCache(inner);
    const result = await provider.geocode('165 1st Ave');

    // The old-prefix entry is invisible to the new lookup, so inner is
    // still called and the real result is what comes back...
    expect(inner.geocode).toHaveBeenCalledTimes(1);
    expect(result).toEqual(geocoded);

    // ...and it's stored under the new prefix, not merged into the old one.
    const newKey = 'geo.v2:165 1st ave';
    const stored = (await chrome.storage.local.get(newKey))[newKey] as {
      value: GeocodedLocation;
    };
    expect(stored.value).toEqual(geocoded);

    // The stale old-prefix entry is left in place (orphaned, not migrated
    // or deleted) — TTL expiry, not cleanup code, is what ages it out.
    const staleKey = 'geo:165 1st ave';
    expect((await chrome.storage.local.get(staleKey))[staleKey]).toBeDefined();
  });

  it('rounds isochrone coordinates to 5 decimal places before storing and returning', async () => {
    const inner = fakeInner();
    const provider = withCache(inner);

    const result = await provider.getIsochrone(
      { lat: 40.7484, lng: -73.9857 },
      1800,
      'transit'
    );

    expect(result).toEqual({
      type: 'MultiPolygon',
      coordinates: [[[[-73.98571, 40.74841]]]],
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createMessageHandler,
  GEOCODE_ADDRESSES,
  GET_ISOCHRONE,
} from '../src/lib/messages';
import { withCache } from '../src/lib/cache';
import type { CommuteProvider, CommuteSettings } from '../src/types';

const settings: CommuteSettings = {
  workAddress: '350 5th Ave, New York, NY',
  maxMinutes: 30,
  mode: 'transit',
};

const geocoded = {
  lat: 40.7484,
  lng: -73.9857,
  formatted: '350 5th Ave, New York, NY 10118, United States of America',
};

const fakeSender = {} as chrome.runtime.MessageSender;

function createFakeProvider(): CommuteProvider {
  return {
    geocode: vi.fn().mockResolvedValue(geocoded),
    getIsochrone: vi
      .fn()
      .mockResolvedValue({ type: 'MultiPolygon', coordinates: [] }),
  };
}

describe('createMessageHandler', () => {
  it('returns true for GET_ISOCHRONE to keep the async channel open', () => {
    const handler = createMessageHandler(createFakeProvider());
    const result = handler(
      { type: GET_ISOCHRONE, settings },
      fakeSender,
      vi.fn()
    );
    expect(result).toBe(true);
  });

  it('calls sendResponse asynchronously with the provider result', async () => {
    const provider = createFakeProvider();
    const handler = createMessageHandler(provider);
    const sendResponse = vi.fn();

    handler({ type: GET_ISOCHRONE, settings }, fakeSender, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        polygon: { type: 'MultiPolygon', coordinates: [] },
        resolvedAddress: geocoded.formatted,
      });
    });
  });

  it('returns undefined and never calls sendResponse for unknown message types', async () => {
    // src/lib/log.ts binds console.error at module-load time (see
    // test/log.test.ts), so a spy installed here after messages.ts is
    // already imported can't intercept the call — reset modules and
    // re-import so the bind picks up the spy and error output stays quiet.
    vi.resetModules();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { createMessageHandler: freshCreateMessageHandler } = await import(
      '../src/lib/messages'
    );

    const handler = freshCreateMessageHandler(createFakeProvider());
    const sendResponse = vi.fn();

    const result = handler(
      { type: 'SOME_OTHER_MESSAGE' },
      fakeSender,
      sendResponse
    );

    expect(result).toBeUndefined();
    // Give any stray microtasks a chance to run before asserting the negative.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendResponse).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('passes settings through to the provider', async () => {
    const provider = createFakeProvider();
    const handler = createMessageHandler(provider);

    handler({ type: GET_ISOCHRONE, settings }, fakeSender, vi.fn());

    await vi.waitFor(() => {
      expect(provider.geocode).toHaveBeenCalledWith(settings.workAddress);
    });
    expect(provider.getIsochrone).toHaveBeenCalledWith(
      geocoded,
      settings.maxMinutes * 60,
      settings.mode
    );
  });

  it('converts a rejected provider call into { ok: false, error }', async () => {
    const provider: CommuteProvider = {
      geocode: vi.fn().mockRejectedValue(new Error('boom')),
      getIsochrone: vi
        .fn()
        .mockResolvedValue({ type: 'MultiPolygon', coordinates: [] }),
    };
    const handler = createMessageHandler(provider);
    const sendResponse = vi.fn();

    handler({ type: GET_ISOCHRONE, settings }, fakeSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'boom' });
    });
  });

  it('caches repeated identical requests so the inner provider runs once, resolvedAddress included on both paths', async () => {
    const inner = createFakeProvider();
    const handler = createMessageHandler(withCache(inner));

    const first = vi.fn();
    handler({ type: GET_ISOCHRONE, settings }, fakeSender, first);
    await vi.waitFor(() => expect(first).toHaveBeenCalled());

    const second = vi.fn();
    handler({ type: GET_ISOCHRONE, settings }, fakeSender, second);
    await vi.waitFor(() => expect(second).toHaveBeenCalled());

    expect(first).toHaveBeenCalledWith({
      ok: true,
      polygon: { type: 'MultiPolygon', coordinates: [] },
      resolvedAddress: geocoded.formatted,
    });
    // withCache caches the full GeocodedLocation (including `formatted`),
    // so the cache-hit path (this second call) carries resolvedAddress too
    // — verified explicitly here rather than assumed.
    expect(second).toHaveBeenCalledWith({
      ok: true,
      polygon: { type: 'MultiPolygon', coordinates: [] },
      resolvedAddress: geocoded.formatted,
    });
    expect(second).toHaveBeenCalledWith(first.mock.calls[0]?.[0]);
    expect(inner.getIsochrone).toHaveBeenCalledTimes(1);
  });
});

describe('createMessageHandler — GEOCODE_ADDRESSES', () => {
  it('returns true to keep the async channel open', () => {
    const handler = createMessageHandler(createFakeProvider());
    const result = handler(
      { type: GEOCODE_ADDRESSES, addresses: ['1 Main St, New York, NY'] },
      fakeSender,
      vi.fn()
    );
    expect(result).toBe(true);
  });

  it('resolves every address on an all-success batch', async () => {
    const provider: CommuteProvider = {
      geocode: vi.fn((address: string) =>
        Promise.resolve({
          lat: address === 'A' ? 1 : 2,
          lng: address === 'A' ? 3 : 4,
          formatted: address,
        })
      ),
      getIsochrone: vi.fn(),
    };
    const handler = createMessageHandler(provider);
    const sendResponse = vi.fn();

    handler(
      { type: GEOCODE_ADDRESSES, addresses: ['A', 'B'] },
      fakeSender,
      sendResponse
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      results: {
        A: { lat: 1, lng: 3 },
        B: { lat: 2, lng: 4 },
      },
    });
    expect(provider.geocode).toHaveBeenCalledTimes(2);
  });

  it('maps an individual address failure to null without failing the batch', async () => {
    const provider: CommuteProvider = {
      geocode: vi.fn((address: string) =>
        address === 'bad'
          ? Promise.reject(
              new Error('Could not find that address in the NYC area')
            )
          : Promise.resolve({ lat: 1, lng: 2, formatted: address })
      ),
      getIsochrone: vi.fn(),
    };
    const handler = createMessageHandler(provider);
    const sendResponse = vi.fn();

    handler(
      { type: GEOCODE_ADDRESSES, addresses: ['good', 'bad'] },
      fakeSender,
      sendResponse
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      results: {
        good: { lat: 1, lng: 2 },
        bad: null,
      },
    });
  });

  it('returns ok:false for a missing API key — a systemic failure, not a per-address null', async () => {
    const provider: CommuteProvider = {
      geocode: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'No Geoapify API key — create a .env file from .env.example and rebuild'
          )
        ),
      getIsochrone: vi.fn(),
    };
    const handler = createMessageHandler(provider);
    const sendResponse = vi.fn();

    handler(
      { type: GEOCODE_ADDRESSES, addresses: ['A', 'B'] },
      fakeSender,
      sendResponse
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error:
        'No Geoapify API key — create a .env file from .env.example and rebuild',
    });
  });

  it('leans on withCache rather than its own cache layer: a repeated address across batches reaches the inner provider once', async () => {
    const inner = createFakeProvider();
    const handler = createMessageHandler(withCache(inner));

    const first = vi.fn();
    handler(
      { type: GEOCODE_ADDRESSES, addresses: [settings.workAddress] },
      fakeSender,
      first
    );
    await vi.waitFor(() => expect(first).toHaveBeenCalled());

    const second = vi.fn();
    handler(
      {
        type: GEOCODE_ADDRESSES,
        addresses: [settings.workAddress, 'another address, New York, NY'],
      },
      fakeSender,
      second
    );
    await vi.waitFor(() => expect(second).toHaveBeenCalled());

    // One call for the first batch's address, one for the second batch's
    // genuinely new address — the repeat of settings.workAddress in the
    // second batch is a cache hit, not a second inner.geocode call.
    expect(inner.geocode).toHaveBeenCalledTimes(2);
  });
});

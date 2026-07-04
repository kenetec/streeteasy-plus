import { describe, expect, it, vi } from 'vitest';
import { createMessageHandler, GET_ISOCHRONE } from '../src/lib/messages';
import type { CommuteProvider, CommuteSettings } from '../src/types';

const settings: CommuteSettings = {
  workAddress: '350 5th Ave, New York, NY',
  maxMinutes: 30,
  mode: 'transit',
};

const fakeSender = {} as chrome.runtime.MessageSender;

function createFakeProvider(): CommuteProvider {
  return {
    geocode: vi.fn().mockResolvedValue({ lat: 40.7484, lng: -73.9857 }),
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
      });
    });
  });

  it('returns undefined and never calls sendResponse for unknown message types', async () => {
    const handler = createMessageHandler(createFakeProvider());
    const sendResponse = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

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

  it('logs an error for unhandled message types', () => {
    const handler = createMessageHandler(createFakeProvider());
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    handler({ type: 'SOME_OTHER_MESSAGE' }, fakeSender, vi.fn());

    expect(consoleError).toHaveBeenCalledWith(
      '[commute-filter] unhandled message',
      { type: 'SOME_OTHER_MESSAGE' }
    );

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
      { lat: 40.7484, lng: -73.9857 },
      settings.maxMinutes * 60,
      settings.mode
    );
  });
});

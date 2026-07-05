import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeoapifyProvider } from '../src/lib/geoapify';

function fakeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

const getApiKey = async () => 'test-key';

describe('createGeoapifyProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('geocode', () => {
    it('builds the geocode URL with the encoded address and key, and returns lat/lng/formatted', async () => {
      vi.mocked(fetch).mockResolvedValue(
        fakeResponse(200, {
          features: [
            {
              properties: {
                lat: 40.7484,
                lon: -73.9857,
                formatted: '350 5th Ave, New York, NY',
              },
            },
          ],
        })
      );

      const provider = createGeoapifyProvider(getApiKey);
      const result = await provider.geocode('350 5th Ave, New York, NY');

      expect(result).toEqual({
        lat: 40.7484,
        lng: -73.9857,
        formatted: '350 5th Ave, New York, NY',
      });

      const url = new URL(vi.mocked(fetch).mock.calls[0]?.[0] as string);
      expect(url.origin + url.pathname).toBe(
        'https://api.geoapify.com/v1/geocode/search'
      );
      expect(url.searchParams.get('text')).toBe('350 5th Ave, New York, NY');
      expect(url.searchParams.get('apiKey')).toBe('test-key');
    });

    it('throws a typed error when there are zero results', async () => {
      vi.mocked(fetch).mockResolvedValue(fakeResponse(200, { features: [] }));

      const provider = createGeoapifyProvider(getApiKey);

      await expect(provider.geocode('nowhere')).rejects.toThrow(
        'Could not find that address'
      );
    });
  });

  describe('getIsochrone', () => {
    it('passes range in seconds and mode verbatim in the isoline URL', async () => {
      vi.mocked(fetch).mockResolvedValue(
        fakeResponse(200, {
          features: [
            {
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [1, 2],
                    [3, 4],
                  ],
                ],
              },
            },
          ],
        })
      );

      const provider = createGeoapifyProvider(getApiKey);
      await provider.getIsochrone({ lat: 40.7484, lng: -73.9857 }, 1800, 'transit');

      const url = new URL(vi.mocked(fetch).mock.calls[0]?.[0] as string);
      expect(url.searchParams.get('range')).toBe('1800');
      expect(url.searchParams.get('mode')).toBe('transit');
      expect(url.searchParams.get('type')).toBe('time');
      expect(url.searchParams.get('lat')).toBe('40.7484');
      expect(url.searchParams.get('lon')).toBe('-73.9857');
    });

    it('normalizes a Polygon response to MultiPolygon', async () => {
      const ring = [
        [1, 2],
        [3, 4],
      ];
      vi.mocked(fetch).mockResolvedValue(
        fakeResponse(200, {
          features: [{ geometry: { type: 'Polygon', coordinates: [ring] } }],
        })
      );

      const provider = createGeoapifyProvider(getApiKey);
      const polygon = await provider.getIsochrone({ lat: 0, lng: 0 }, 600, 'walk');

      expect(polygon).toEqual({ type: 'MultiPolygon', coordinates: [[ring]] });
    });

    it('passes a MultiPolygon response through unchanged', async () => {
      const coordinates = [
        [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      ];
      vi.mocked(fetch).mockResolvedValue(
        fakeResponse(200, {
          features: [{ geometry: { type: 'MultiPolygon', coordinates } }],
        })
      );

      const provider = createGeoapifyProvider(getApiKey);
      const polygon = await provider.getIsochrone({ lat: 0, lng: 0 }, 600, 'walk');

      expect(polygon).toEqual({ type: 'MultiPolygon', coordinates });
    });

    it('polls after a 202 and resolves once the poll returns 200', async () => {
      vi.useFakeTimers();
      const coordinates = [[[[1, 2]]]];
      vi.mocked(fetch)
        .mockResolvedValueOnce(fakeResponse(202, { properties: { id: 'abc123' } }))
        .mockResolvedValueOnce(
          fakeResponse(200, {
            features: [{ geometry: { type: 'MultiPolygon', coordinates } }],
          })
        );

      const provider = createGeoapifyProvider(getApiKey);
      const promise = provider.getIsochrone({ lat: 0, lng: 0 }, 600, 'walk');

      await vi.advanceTimersByTimeAsync(1500);
      const polygon = await promise;

      expect(polygon).toEqual({ type: 'MultiPolygon', coordinates });
      expect(fetch).toHaveBeenCalledTimes(2);
      const pollUrl = new URL(vi.mocked(fetch).mock.calls[1]?.[0] as string);
      expect(pollUrl.searchParams.get('id')).toBe('abc123');
    });

    it('throws a timeout error after exhausting all poll attempts', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockResolvedValue(
        fakeResponse(202, { properties: { id: 'abc123' } })
      );

      const provider = createGeoapifyProvider(getApiKey);
      const promise = provider.getIsochrone({ lat: 0, lng: 0 }, 600, 'walk');
      const assertion = expect(promise).rejects.toThrow(
        'Isochrone is taking too long — try again'
      );

      await vi.advanceTimersByTimeAsync(1500);
      await vi.advanceTimersByTimeAsync(1500);
      await vi.advanceTimersByTimeAsync(1500);
      await assertion;

      // 1 initial request + 3 poll attempts
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('throws a key-invalid error on 401', async () => {
      vi.mocked(fetch).mockResolvedValue(fakeResponse(401, {}));
      const provider = createGeoapifyProvider(getApiKey);
      await expect(
        provider.getIsochrone({ lat: 0, lng: 0 }, 600, 'walk')
      ).rejects.toThrow('Geoapify API key is invalid or missing');
    });

    it('surfaces the body message on 400', async () => {
      vi.mocked(fetch).mockResolvedValue(
        fakeResponse(400, { message: 'range too large' })
      );
      const provider = createGeoapifyProvider(getApiKey);
      await expect(
        provider.getIsochrone({ lat: 0, lng: 0 }, 600, 'walk')
      ).rejects.toThrow('range too large');
    });

    it('throws before making a request when the key is missing', async () => {
      const provider = createGeoapifyProvider(async () => null);
      await expect(
        provider.getIsochrone({ lat: 0, lng: 0 }, 600, 'walk')
      ).rejects.toThrow('No Geoapify API key');
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

// Fixture is loaded once at module scope (~1MB; per-test re-parsing would
// be slow) per PR 2's fixture contract (test/fixture.test.ts).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractListingGeo } from '../src/content/streeteasy-jsonld';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/search-results.html'
);
const html = readFileSync(fixturePath, 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

function docWithLdJson(json: unknown): Document {
  const script = `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
  return new DOMParser().parseFromString(`<html><head>${script}</head></html>`, 'text/html');
}

describe('extractListingGeo (fixture)', () => {
  const geo = extractListingGeo(doc);

  it('extracts at least 10 entries', () => {
    expect(geo.size).toBeGreaterThanOrEqual(10);
  });

  it('every entry has finite lat/lng in the NYC sanity band', () => {
    for (const entry of geo.values()) {
      expect(Number.isFinite(entry.lat)).toBe(true);
      expect(Number.isFinite(entry.lng)).toBe(true);
      expect(entry.lat).toBeGreaterThan(40);
      expect(entry.lat).toBeLessThan(42);
      expect(entry.lng).toBeGreaterThan(-75);
      expect(entry.lng).toBeLessThan(-72);
    }
  });

  it('excludes non-Apartment @graph nodes (Organization/WebSite/Event)', () => {
    // The fixture's Organization and WebSite nodes are both named
    // "StreetEasy" and point at the bare root url — neither should surface.
    for (const entry of geo.values()) {
      expect(entry.displayName).not.toBe('StreetEasy');
    }
    expect(geo.has('https://streeteasy.com/')).toBe(false);
  });

  it('maps a known listing name to its known lat/lng (named-field sanity check)', () => {
    // JSON-LD stores latitude/longitude as named fields; the geometry
    // module (PR 1) instead takes GeoJSON [lng, lat] positions. This
    // module's output is named {lat, lng} — confirm that naming holds for
    // one hardcoded, fixture-grepped pair rather than assuming it.
    const known = geo.get(
      'https://streeteasy.com/building/the-crossing-at-420-e-102nd-street/01l'
    );
    expect(known?.displayName).toBe('420 East 102nd Street #1L');
    expect(known?.lat).toBeCloseTo(40.78643, 5);
    expect(known?.lng).toBeCloseTo(-73.941505, 5);
  });
});

describe('extractListingGeo (synthetic)', () => {
  it('skips a script that fails to parse as JSON', () => {
    const malformedDoc = new DOMParser().parseFromString(
      '<html><head><script type="application/ld+json">{ not valid json </script></head></html>',
      'text/html'
    );
    expect(extractListingGeo(malformedDoc).size).toBe(0);
  });

  it('accepts @type as an array containing "Apartment"', () => {
    const arrayTypeDoc = docWithLdJson({
      '@graph': [
        {
          '@type': ['Apartment', 'Product'],
          url: 'https://streeteasy.com/building/foo/1a',
          name: 'Foo #1A',
          geo: { '@type': 'GeoCoordinates', latitude: 40.7, longitude: -73.9 },
        },
      ],
    });
    const result = extractListingGeo(arrayTypeDoc);
    expect(result.size).toBe(1);
    expect(result.get('https://streeteasy.com/building/foo/1a')?.lat).toBe(
      40.7
    );
  });

  it('rejects an Apartment node missing geo', () => {
    const noGeoDoc = docWithLdJson({
      '@graph': [
        {
          '@type': 'Apartment',
          url: 'https://streeteasy.com/building/foo/1a',
          name: 'Foo #1A',
        },
      ],
    });
    expect(extractListingGeo(noGeoDoc).size).toBe(0);
  });
});

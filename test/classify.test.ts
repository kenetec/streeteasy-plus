// Fixture is loaded once at module scope (~1MB; per-test re-parsing would
// be slow) per PR 2's fixture contract (test/fixture.test.ts). Tests that
// mutate the DOM re-parse their own copy so tests don't interfere.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyCards, COMMUTE_ATTR } from '../src/content/classify';
import { discoverCards } from '../src/content/streeteasy-dom';
import { extractListingGeo } from '../src/content/streeteasy-jsonld';
import type { MultiPolygonCoords } from '../src/lib/geometry';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/search-results.html'
);
const html = readFileSync(fixturePath, 'utf8');

function parseFixture(): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

// A join key that's unique in the fixture (one DOM card, one JSON-LD
// Apartment node) — the fixture also has two cross-listed duplicates
// (same unit, two cards), which would complicate a single-card assertion.
const KNOWN_URL = 'https://streeteasy.com/building/the34/617';

/** [lng, lat] order — see src/lib/geometry.ts's Position doc comment. */
function squareAround(
  lat: number,
  lng: number,
  delta: number
): MultiPolygonCoords {
  return [
    [
      [
        [lng - delta, lat - delta],
        [lng + delta, lat - delta],
        [lng + delta, lat + delta],
        [lng - delta, lat + delta],
        [lng - delta, lat - delta],
      ],
    ],
  ];
}

const ALL_ENCOMPASSING: MultiPolygonCoords = [
  [
    [
      [-75, 40],
      [-72, 40],
      [-72, 42],
      [-75, 42],
      [-75, 40],
    ],
  ],
];

const EMPTY: MultiPolygonCoords = [];

describe('classifyCards (fixture, known-listing swap tripwire)', () => {
  it('classifies the known listing "within" a tight square around it, and at least one other card "beyond"', () => {
    const doc = parseFixture();

    // Read the known listing's real coordinates from the fixture at test
    // time — never hardcoded — so a fixture refresh can't invalidate this.
    const known = extractListingGeo(doc).get(KNOWN_URL);
    expect(known).toBeDefined();
    const polygon = squareAround(known!.lat, known!.lng, 0.001);

    const knownCard = discoverCards(doc).find(
      (card) => card.listingUrl === KNOWN_URL
    );
    expect(knownCard).toBeDefined();

    const result = classifyCards(doc, polygon);

    // This is the coordinate-order tripwire: if lat/lng were swapped
    // anywhere in the pipeline, the tight square (built in correct
    // [lng, lat] order) would never contain the point, and this listing
    // would come back "beyond" instead of "within".
    expect(knownCard!.element.getAttribute(COMMUTE_ATTR)).toBe('within');
    expect(result.within).toBeGreaterThanOrEqual(1);
    expect(result.beyond).toBeGreaterThanOrEqual(1);
  });
});

describe('classifyCards (fixture, polygon edge cases)', () => {
  it('an all-encompassing polygon yields zero beyond and within === located count', () => {
    const doc = parseFixture();
    const totalCards = discoverCards(doc).length;

    const result = classifyCards(doc, ALL_ENCOMPASSING);

    expect(result.beyond).toBe(0);
    expect(result.within + result.unknown).toBe(totalCards);
    expect(result.within).toBeGreaterThanOrEqual(10);
  });

  it('an empty MultiPolygon yields zero within and every located card is beyond', () => {
    const doc = parseFixture();
    const result = classifyCards(doc, EMPTY);

    expect(result.within).toBe(0);
    expect(result.beyond).toBeGreaterThanOrEqual(10);
  });
});

describe('classifyCards (unknown path)', () => {
  it('marks a card "unknown" when its JSON-LD Apartment node is removed, and accounts for every card exactly once', () => {
    const doc = parseFixture();
    const cards = discoverCards(doc);
    const targetUrl = cards[0]!.listingUrl;

    // The card survives discovery (its anchor is untouched) but can no
    // longer join to a geo entry — this is classifyCards' own "unknown"
    // path, distinct from streeteasy-dom.ts skipping anchor-less cards.
    const script = doc.querySelector('script[type="application/ld+json"]')!;
    const data = JSON.parse(script.textContent ?? '{}');
    data['@graph'] = (data['@graph'] as Array<Record<string, unknown>>).filter(
      (node) => !(node['@type'] === 'Apartment' && node.url === targetUrl)
    );
    script.textContent = JSON.stringify(data);

    const result = classifyCards(doc, ALL_ENCOMPASSING);

    const targetCard = cards.find((card) => card.listingUrl === targetUrl);
    expect(targetCard!.element.getAttribute(COMMUTE_ATTR)).toBe('unknown');
    expect(result.within + result.beyond + result.unknown).toBe(cards.length);
    expect(result.unknown).toBeGreaterThanOrEqual(1);
  });
});

describe('classifyCards (re-run semantics)', () => {
  it('a second run with different data overwrites stale verdicts from the first', () => {
    const doc = parseFixture();
    const totalCards = discoverCards(doc).length;

    const first = classifyCards(doc, ALL_ENCOMPASSING);
    expect(first.within).toBeGreaterThanOrEqual(10);
    expect(first.beyond).toBe(0);

    const second = classifyCards(doc, EMPTY);
    expect(second.within).toBe(0);
    expect(second.beyond).toBeGreaterThanOrEqual(10);
    expect(second.within + second.beyond + second.unknown).toBe(totalCards);

    // No card should still read "within" from the first run.
    const withinAttrCount = doc.querySelectorAll(
      `[${COMMUTE_ATTR}="within"]`
    ).length;
    expect(withinAttrCount).toBe(0);
  });
});

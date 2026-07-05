// Fixture is loaded once at module scope (~1MB; per-test re-parsing would
// be slow) per PR 2's fixture contract (test/fixture.test.ts).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverCards } from '../src/content/streeteasy-dom';
import { extractListingGeo } from '../src/content/streeteasy-jsonld';
import { matchCardsToGeo } from '../src/content/match';
import type { DiscoveredCard } from '../src/content/streeteasy-dom';
import type { ListingGeo } from '../src/content/streeteasy-jsonld';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/search-results.html'
);
const html = readFileSync(fixturePath, 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('matchCardsToGeo (fixture)', () => {
  const cards = discoverCards(doc);
  const geo = extractListingGeo(doc);
  const { located, unmatched } = matchCardsToGeo(cards, geo);

  it('matches at least 10 cards', () => {
    expect(located.length).toBeGreaterThanOrEqual(10);
  });

  it('accounts for every discovered card exactly once', () => {
    expect(located.length + unmatched.length).toBe(cards.length);
  });

  it('leaves only a small number of cards unmatched', () => {
    // If this creeps above 2 on this fixture, the join-key assumption
    // (card anchor href === JSON-LD Apartment url, query/hash stripped) is
    // wrong — investigate rather than loosening this assertion.
    expect(unmatched.length).toBeLessThanOrEqual(2);
  });
});

describe('matchCardsToGeo (synthetic)', () => {
  it('keeps unmatched cards rather than dropping them', () => {
    const element = {} as Element;
    const cards: DiscoveredCard[] = [
      { element, listingUrl: 'https://streeteasy.com/building/known/1a' },
      { element, listingUrl: 'https://streeteasy.com/building/unknown/2b' },
    ];
    const geo = new Map<string, ListingGeo>([
      [
        'https://streeteasy.com/building/known/1a',
        {
          listingUrl: 'https://streeteasy.com/building/known/1a',
          lat: 40.7,
          lng: -73.9,
          displayName: 'Known St #1A',
        },
      ],
    ]);

    const { located, unmatched } = matchCardsToGeo(cards, geo);
    expect(located).toEqual([
      {
        element,
        lat: 40.7,
        lng: -73.9,
        listingUrl: 'https://streeteasy.com/building/known/1a',
      },
    ]);
    expect(unmatched).toEqual([cards[1]]);
  });
});

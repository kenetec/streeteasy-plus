// Fixture is loaded once at module scope (~1MB; per-test re-parsing would
// be slow) per PR 2's fixture contract (test/fixture.test.ts).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  discoverCards,
  normalizeListingUrl,
} from '../src/content/streeteasy-dom';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/search-results.html'
);
const html = readFileSync(fixturePath, 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

function parseFragment(fragment: string): Document {
  return new DOMParser().parseFromString(`<div>${fragment}</div>`, 'text/html');
}

describe('discoverCards (fixture)', () => {
  const cards = discoverCards(doc);

  it('finds at least 10 cards', () => {
    expect(cards.length).toBeGreaterThanOrEqual(10);
  });

  it('normalizes every listingUrl (no query, no hash, streeteasy.com host)', () => {
    for (const card of cards) {
      expect(card.listingUrl).not.toMatch(/[?#]/);
      expect(card.listingUrl).toMatch(/^https:\/\/streeteasy\.com\//);
    }
  });

  it('strips ?featured=1 from the known featured card', () => {
    const featured = cards.find((card) =>
      card.listingUrl.includes('the-crossing-at-420-e-102nd-street')
    );
    expect(featured?.listingUrl).toBe(
      'https://streeteasy.com/building/the-crossing-at-420-e-102nd-street/01l'
    );
  });
});

describe('discoverCards (synthetic)', () => {
  it('skips a card with no anchor', () => {
    const fragmentDoc = parseFragment(
      '<div data-testid="listing-card"><span>no link here</span></div>'
    );
    expect(discoverCards(fragmentDoc)).toEqual([]);
  });

  it('skips a card whose only anchor is not a listing link', () => {
    const fragmentDoc = parseFragment(
      '<div data-testid="listing-card"><a href="/save-search">Save</a></div>'
    );
    expect(discoverCards(fragmentDoc)).toEqual([]);
  });

  it('resolves a relative href against streeteasy.com', () => {
    const fragmentDoc = parseFragment(
      '<div data-testid="listing-card"><a href="/building/foo/1a">Foo #1A</a></div>'
    );
    const [card] = discoverCards(fragmentDoc);
    expect(card?.listingUrl).toBe('https://streeteasy.com/building/foo/1a');
  });

  it('skips a card whose only anchor href is malformed', () => {
    const fragmentDoc = parseFragment(
      '<div data-testid="listing-card"><a href="http://[::1">bad</a></div>'
    );
    expect(discoverCards(fragmentDoc)).toEqual([]);
  });
});

describe('normalizeListingUrl', () => {
  it('strips the query string', () => {
    expect(
      normalizeListingUrl('https://streeteasy.com/building/x/1?featured=1')
    ).toBe('https://streeteasy.com/building/x/1');
  });

  it('strips the hash', () => {
    expect(
      normalizeListingUrl('https://streeteasy.com/building/x/1#photos')
    ).toBe('https://streeteasy.com/building/x/1');
  });

  it('strips a trailing slash', () => {
    expect(normalizeListingUrl('https://streeteasy.com/building/x/1/')).toBe(
      'https://streeteasy.com/building/x/1'
    );
  });

  it('returns null for a non-streeteasy host', () => {
    expect(normalizeListingUrl('https://example.com/building/x/1')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(normalizeListingUrl('http://[::1')).toBeNull();
  });
});

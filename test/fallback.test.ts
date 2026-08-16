// fallback.ts is deps-injected (no chrome APIs), so these tests build a
// small synthetic DOM by hand rather than pulling in the ~1MB real fixture
// — full control over which cards are "unknown" and what their address
// text looks like is what these cases need.
import { describe, expect, it, vi } from 'vitest';
import { resolveUnknownCards } from '../src/content/fallback';
import { COMMUTE_ATTR } from '../src/content/classify';
import type { MultiPolygonCoords } from '../src/lib/geometry';
import type { GeocodeAddressesResult } from '../src/types';

function makeDoc(): Document {
  return new DOMParser().parseFromString(
    '<!doctype html><html><body></body></html>',
    'text/html'
  );
}

/** Builds a card already stamped "unknown" (as wave 1 leaves it), with the
 * same address/neighborhood markup shape findListingAddress expects. */
function addUnknownCard(
  doc: Document,
  opts: { href: string; street: string; neighborhood?: string }
): Element {
  const card = doc.createElement('div');
  card.setAttribute('data-testid', 'listing-card');
  card.setAttribute(COMMUTE_ATTR, 'unknown');

  const wrapper = doc.createElement('div');
  if (opts.neighborhood) {
    const p = doc.createElement('p');
    p.textContent = `Rental unit in ${opts.neighborhood}`;
    wrapper.appendChild(p);
  }
  const anchor = doc.createElement('a');
  anchor.setAttribute('href', opts.href);
  anchor.textContent = opts.street;
  wrapper.appendChild(anchor);
  card.appendChild(wrapper);

  doc.body.appendChild(card);
  return card;
}

/** [lng, lat] order — see src/lib/geometry.ts's Position doc comment. */
function squareAround(lat: number, lng: number, delta: number): MultiPolygonCoords {
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

describe('resolveUnknownCards', () => {
  it('upgrades resolved unknown cards to within/beyond per the polygon', async () => {
    const doc = makeDoc();
    const withinCard = addUnknownCard(doc, {
      href: '/building/a/1',
      street: '1 Main Street',
      neighborhood: 'Nowhere',
    });
    const beyondCard = addUnknownCard(doc, {
      href: '/building/b/1',
      street: '2 Main Street',
      neighborhood: 'Nowhere',
    });

    const withinCoords = { lat: 40.75, lng: -73.98 };
    const beyondCoords = { lat: 40.8, lng: -73.9 };
    const polygon = squareAround(withinCoords.lat, withinCoords.lng, 0.001);

    const results: GeocodeAddressesResult = {
      '1 Main Street, Nowhere, New York, NY': withinCoords,
      '2 Main Street, Nowhere, New York, NY': beyondCoords,
    };
    const geocode = vi.fn().mockResolvedValue(results);

    await resolveUnknownCards(doc, polygon, { geocode });

    expect(withinCard.getAttribute(COMMUTE_ATTR)).toBe('within');
    expect(beyondCard.getAttribute(COMMUTE_ATTR)).toBe('beyond');
  });

  it('leaves a card unknown when its geocode result is null', async () => {
    const doc = makeDoc();
    const card = addUnknownCard(doc, {
      href: '/building/a/1',
      street: '1 Main Street',
    });

    const geocode = vi
      .fn()
      .mockResolvedValue({ '1 Main Street, New York, NY': null });

    await resolveUnknownCards(doc, ALL_ENCOMPASSING, { geocode });

    expect(card.getAttribute(COMMUTE_ATTR)).toBe('unknown');
  });

  it('excludes an unknown card with no extractable address from the batch entirely, leaving it unknown', async () => {
    const doc = makeDoc();
    const card = doc.createElement('div');
    card.setAttribute('data-testid', 'listing-card');
    card.setAttribute(COMMUTE_ATTR, 'unknown');
    doc.body.appendChild(card);

    const geocode = vi.fn();
    await resolveUnknownCards(doc, ALL_ENCOMPASSING, { geocode });

    expect(geocode).not.toHaveBeenCalled();
    expect(card.getAttribute(COMMUTE_ATTR)).toBe('unknown');
  });

  it('dedupes two cards that share an address (after unit-suffix stripping) into one batch entry', async () => {
    const doc = makeDoc();
    addUnknownCard(doc, { href: '/building/a/101', street: '1 Main Street #1A' });
    addUnknownCard(doc, { href: '/building/a/102', street: '1 Main Street #2B' });

    const geocode = vi.fn().mockResolvedValue({
      '1 Main Street, New York, NY': { lat: 40.75, lng: -73.98 },
    });

    await resolveUnknownCards(doc, ALL_ENCOMPASSING, { geocode });

    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledWith(['1 Main Street, New York, NY']);
  });

  it('skips stamping a card detached from the DOM while its geocode was in flight, without throwing', async () => {
    const doc = makeDoc();
    const detached = addUnknownCard(doc, {
      href: '/building/a/1',
      street: '1 Main Street',
    });
    const stays = addUnknownCard(doc, {
      href: '/building/b/1',
      street: '2 Main Street',
    });

    let resolveGeocode!: (value: GeocodeAddressesResult) => void;
    const pending = new Promise<GeocodeAddressesResult>((resolve) => {
      resolveGeocode = resolve;
    });
    const geocode = vi.fn().mockReturnValue(pending);

    const promise = resolveUnknownCards(doc, ALL_ENCOMPASSING, { geocode });

    // Simulate the observer era: StreetEasy swaps this card's node out
    // while the geocode is still in flight.
    detached.remove();

    resolveGeocode({
      '1 Main Street, New York, NY': { lat: 40.75, lng: -73.98 },
      '2 Main Street, New York, NY': { lat: 40.75, lng: -73.98 },
    });

    await expect(promise).resolves.toBeUndefined();

    expect(detached.getAttribute(COMMUTE_ATTR)).toBe('unknown');
    expect(stays.getAttribute(COMMUTE_ATTR)).toBe('within');
  });

  it('discards ALL results without stamping anything when isStale() flips true during the await', async () => {
    const doc = makeDoc();
    const cardA = addUnknownCard(doc, {
      href: '/building/a/1',
      street: '1 Main Street',
    });
    const cardB = addUnknownCard(doc, {
      href: '/building/b/1',
      street: '2 Main Street',
    });

    let resolveGeocode!: (value: GeocodeAddressesResult) => void;
    const pending = new Promise<GeocodeAddressesResult>((resolve) => {
      resolveGeocode = resolve;
    });
    const geocode = vi.fn().mockReturnValue(pending);
    let stale = false;

    const promise = resolveUnknownCards(doc, ALL_ENCOMPASSING, {
      geocode,
      isStale: () => stale,
    });

    // A newer wave (Apply/Clear/observer re-run) supersedes this one while
    // its geocode batch is still in flight.
    stale = true;
    resolveGeocode({
      '1 Main Street, New York, NY': { lat: 40.75, lng: -73.98 },
      '2 Main Street, New York, NY': { lat: 40.75, lng: -73.98 },
    });

    await expect(promise).resolves.toBeUndefined();

    // Neither card stamped — not even the ones that "would have" resolved
    // to a verdict. A stale wave discards its whole batch, not just the
    // cards it can't place.
    expect(cardA.getAttribute(COMMUTE_ATTR)).toBe('unknown');
    expect(cardB.getAttribute(COMMUTE_ATTR)).toBe('unknown');
  });
});

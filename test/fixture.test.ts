// Guards the committed fixture's contract for downstream PRs (listing-card
// discovery, JSON-LD coordinate extraction), independent of any discovery
// code, which doesn't exist yet. Uses thresholds, not exact counts — future
// fixture refreshes will change counts and must not require test edits.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/search-results.html'
);
const html = readFileSync(fixturePath, 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('search-results.html fixture', () => {
  it('has at least 10 listing cards', () => {
    const cards = doc.querySelectorAll('[data-testid="listing-card"]');
    expect(cards.length).toBeGreaterThanOrEqual(10);
  });

  it('has exactly one application/ld+json script that parses', () => {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(1);
    expect(() => JSON.parse(scripts[0]?.textContent ?? '')).not.toThrow();
  });

  it('has at least 10 Apartment nodes with geo coordinates and a streeteasy.com url', () => {
    const script = doc.querySelector('script[type="application/ld+json"]');
    const parsed = JSON.parse(script?.textContent ?? '{}');
    const graph: unknown[] = Array.isArray(parsed['@graph'])
      ? parsed['@graph']
      : [];
    const apartments = graph.filter(
      (node): node is Record<string, unknown> =>
        typeof node === 'object' &&
        node !== null &&
        (node as Record<string, unknown>)['@type'] === 'Apartment'
    );
    expect(apartments.length).toBeGreaterThanOrEqual(10);

    for (const apartment of apartments) {
      const geo = apartment.geo as Record<string, unknown> | undefined;
      expect(typeof geo?.latitude).toBe('number');
      expect(typeof geo?.longitude).toBe('number');
      expect(typeof apartment.url).toBe('string');
      expect(apartment.url as string).toContain('streeteasy.com');
    }
  });

  it('contains only the ld+json script tag — all other scripts were stripped', () => {
    const scripts = doc.querySelectorAll('script');
    expect(scripts.length).toBe(1);
    expect(scripts[0]?.getAttribute('type')).toBe('application/ld+json');
  });

  it('contains no leaked email address from the sanitized session', () => {
    expect(html).not.toMatch(/@gmail\./i);
  });
});

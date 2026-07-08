import { describe, expect, it } from 'vitest';
import { formatSummary } from '../src/content/summary';
import type { ClassificationResult } from '../src/content/classify';

const ADDRESS = '350 5th Ave, New York, NY 10118, USA';

function counts(overrides: Partial<ClassificationResult>): ClassificationResult {
  return { within: 0, beyond: 0, unknown: 0, ...overrides };
}

describe('formatSummary', () => {
  it('renders the address and all three counts, in order, for a normal spread', () => {
    expect(
      formatSummary(ADDRESS, counts({ within: 5, beyond: 3, unknown: 2 }))
    ).toBe(
      `Commute filter active — from ${ADDRESS} · 5 within · 3 beyond · 2 unknown`
    );
  });

  it('elides the unknown segment when it is zero, but keeps a zero within/beyond', () => {
    // within=0 here alongside beyond>0 and unknown>0 is NOT the all-beyond
    // case (that requires unknown===0 too) — see the precedence test below.
    expect(formatSummary(ADDRESS, counts({ within: 0, beyond: 4, unknown: 3 }))).toBe(
      `Commute filter active — from ${ADDRESS} · 0 within · 4 beyond · 3 unknown`
    );

    // Zero beyond, no unknowns: unknown is elided, zero beyond is kept.
    expect(formatSummary(ADDRESS, counts({ within: 6, beyond: 0, unknown: 0 }))).toBe(
      `Commute filter active — from ${ADDRESS} · 6 within · 0 beyond`
    );
  });

  it('uses the all-beyond phrasing only when within=0 AND unknown=0 AND beyond>0', () => {
    expect(formatSummary(ADDRESS, counts({ within: 0, beyond: 7, unknown: 0 }))).toBe(
      `Commute filter active — from ${ADDRESS} · no listings within reach — try a larger commute range`
    );
  });

  it('precedence: within=0 with unknown>0 and beyond=0 is a spread, not the all-beyond case', () => {
    // Zero within AND zero beyond, but some unknowns: nothing definitively
    // fits or fails to fit yet — that's "we couldn't place these listings",
    // not "no listings within reach", so it must NOT get the all-beyond
    // phrasing even though within is 0.
    expect(formatSummary(ADDRESS, counts({ within: 0, beyond: 0, unknown: 4 }))).toBe(
      `Commute filter active — from ${ADDRESS} · 0 within · 0 beyond · 4 unknown`
    );
  });

  it('falls back to the address-only text when no cards were classified at all', () => {
    expect(formatSummary(ADDRESS, counts({}))).toBe(
      `Commute filter active — from ${ADDRESS}`
    );
  });
});

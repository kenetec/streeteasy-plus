// Formats the on-page banner text from a resolved address and a
// classification tally. Pure function: no DOM, no chrome APIs, no logging,
// and no pluralization logic — "1 within" reads fine without singular/
// plural fussing, so don't add grammar rules here.

import type { ClassificationResult } from './classify';

export function formatSummary(
  resolvedAddress: string,
  counts: ClassificationResult
): string {
  const { within, beyond, unknown } = counts;
  const total = within + beyond + unknown;
  const base = `Commute filter active — from ${resolvedAddress}`;

  // No cards classified at all (e.g. a page state with no cards) — not an
  // error, just nothing to report. Fall back to the address-only text.
  if (total === 0) return base;

  // "All-beyond" means literally every classified card came back beyond —
  // NOT just "zero within". A page with zero within but some unknown cards
  // isn't "nothing fits", it's "we couldn't place some listings", which is
  // a different (and still informative) message — that case falls through
  // to the normal spread below, where the unknown segment is shown rather
  // than elided precisely because it's the reason within reads as zero.
  if (within === 0 && unknown === 0 && beyond > 0) {
    return `${base} · no listings within reach — try a larger commute range`;
  }

  const segments = [`${within} within`, `${beyond} beyond`];
  // Zero within/beyond are informative (kept); zero unknown is just noise
  // (elided) — unknown is the only segment that means "nothing to report"
  // rather than "a real, meaningful zero".
  if (unknown > 0) segments.push(`${unknown} unknown`);

  return `${base} · ${segments.join(' · ')}`;
}

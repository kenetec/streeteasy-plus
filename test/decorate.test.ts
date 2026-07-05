// Fixture is loaded once at module scope (~1MB; per-test re-parsing would
// be slow) per PR 2's fixture contract (test/fixture.test.ts). decorate.ts's
// contract is the data-commute attribute, not classify's pipeline, so these
// tests set that attribute directly on fixture cards rather than running
// classifyCards first.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BADGE_ATTR,
  decorateCards,
  type DecorateSettings,
} from '../src/content/decorate';
import { COMMUTE_ATTR } from '../src/content/classify';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/search-results.html'
);
const html = readFileSync(fixturePath, 'utf8');

function parseFixture(): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const SETTINGS_30: DecorateSettings = { maxMinutes: 30 };
const SETTINGS_25: DecorateSettings = { maxMinutes: 25 };

/** The first three real listing cards from the fixture, for hand-set verdicts. */
function firstThreeCards(doc: Document): Element[] {
  return [...doc.querySelectorAll('[data-testid="listing-card"]')].slice(0, 3);
}

describe('decorateCards', () => {
  it('gives a "within" card exactly one badge with the right text/attribute/class', () => {
    const doc = parseFixture();
    const [card] = firstThreeCards(doc);
    card!.setAttribute(COMMUTE_ATTR, 'within');

    decorateCards(doc, SETTINGS_30);

    const badges = card!.querySelectorAll(`[${BADGE_ATTR}]`);
    expect(badges.length).toBe(1);
    expect(badges[0]?.textContent).toBe('≤ 30 min');
    expect(badges[0]?.classList.contains('commute-badge')).toBe(true);
  });

  it('gives an "unknown" card a muted badge, and a "beyond" card no badge', () => {
    const doc = parseFixture();
    const [unknownCard, beyondCard] = firstThreeCards(doc);
    unknownCard!.setAttribute(COMMUTE_ATTR, 'unknown');
    beyondCard!.setAttribute(COMMUTE_ATTR, 'beyond');

    decorateCards(doc, SETTINGS_30);

    const unknownBadges = unknownCard!.querySelectorAll(`[${BADGE_ATTR}]`);
    expect(unknownBadges.length).toBe(1);
    expect(unknownBadges[0]?.textContent).toBe('commute unknown');
    expect(unknownBadges[0]?.classList.contains('commute-badge')).toBe(true);
    expect(unknownBadges[0]?.classList.contains('commute-badge--unknown')).toBe(
      true
    );

    expect(beyondCard!.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('is idempotent: re-running leaves exactly one badge, and updates its text for new settings', () => {
    const doc = parseFixture();
    const [card] = firstThreeCards(doc);
    card!.setAttribute(COMMUTE_ATTR, 'within');

    decorateCards(doc, SETTINGS_30);
    decorateCards(doc, SETTINGS_30);
    expect(card!.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(1);
    expect(card!.querySelector(`[${BADGE_ATTR}]`)?.textContent).toBe(
      '≤ 30 min'
    );

    decorateCards(doc, SETTINGS_25);
    expect(card!.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(1);
    expect(card!.querySelector(`[${BADGE_ATTR}]`)?.textContent).toBe(
      '≤ 25 min'
    );
  });

  it('removes a badge when a card flips from "within" to "beyond"', () => {
    const doc = parseFixture();
    const [card] = firstThreeCards(doc);
    card!.setAttribute(COMMUTE_ATTR, 'within');

    decorateCards(doc, SETTINGS_30);
    expect(card!.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(1);

    card!.setAttribute(COMMUTE_ATTR, 'beyond');
    decorateCards(doc, SETTINGS_30);
    expect(card!.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('leaves cards with no data-commute attribute untouched', () => {
    const doc = parseFixture();
    const cards = firstThreeCards(doc);
    // None of these cards have data-commute set.

    decorateCards(doc, SETTINGS_30);

    for (const card of cards) {
      expect(card.hasAttribute(COMMUTE_ATTR)).toBe(false);
      expect(card.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(0);
    }
  });
});

describe('content.css migration (smoke)', () => {
  const cssPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/content/content.css'
  );
  const css = readFileSync(cssPath, 'utf8');

  it('contains the new [data-commute="beyond"] selector', () => {
    expect(css).toContain('[data-commute="beyond"]');
  });

  it('no longer contains the retired .commute-filtered-out class', () => {
    expect(css).not.toContain('.commute-filtered-out');
  });
});

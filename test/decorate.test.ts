// Fixture is loaded once at module scope (~1MB; per-test re-parsing would
// be slow) per PR 2's fixture contract (test/fixture.test.ts). decorate.ts's
// contract is the data-commute attribute, not classify's pipeline, so these
// tests set that attribute directly on fixture cards rather than running
// classifyCards first.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, test } from 'vitest';
import {
  BADGE_ATTR,
  decorateCards,
  type DecorateSettings,
} from '../src/content/decorate';
import { COMMUTE_ATTR } from '../src/content/classify';
import { findListingAnchor } from '../src/content/streeteasy-dom';

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

  it('places the badge as the address anchor\'s next sibling, not over the photo', () => {
    const doc = parseFixture();
    const [card] = firstThreeCards(doc);
    const anchor = findListingAnchor(card!);
    expect(anchor).not.toBeNull();

    card!.setAttribute(COMMUTE_ATTR, 'within');
    decorateCards(doc, SETTINGS_30);

    const nextSibling = anchor!.nextElementSibling;
    expect(nextSibling?.getAttribute(BADGE_ATTR)).toBe('');
  });

  it('falls back to appending as the card\'s last child when the anchor is stripped', () => {
    const doc = parseFixture();
    const [card] = firstThreeCards(doc);
    for (const anchor of [...card!.querySelectorAll('a[href]')]) {
      anchor.remove();
    }
    expect(findListingAnchor(card!)).toBeNull();

    card!.setAttribute(COMMUTE_ATTR, 'within');
    decorateCards(doc, SETTINGS_30);

    expect(card!.lastElementChild?.getAttribute(BADGE_ATTR)).toBe('');
    expect(card!.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(1);
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

  it('contains the [data-commute="beyond"] selector', () => {
    expect(css).toContain('[data-commute="beyond"]');
  });

  it('no longer contains the retired .commute-filtered-out class', () => {
    expect(css).not.toContain('.commute-filtered-out');
  });

  it('no longer forces position: relative on [data-commute] cards', () => {
    expect(css).not.toContain('[data-commute] {');
    expect(css).not.toMatch(/\[data-commute\]\s*\{[^}]*position:\s*relative/);
  });

  it('the badge is no longer absolutely positioned', () => {
    expect(css).not.toMatch(/\.commute-badge\s*\{[^}]*position:\s*absolute/);
  });
});


test('content.css dims beyond-cards and restores on hover', () => {
  const css = readFileSync('src/content/content.css', 'utf8');

  // selector must exist WITH its dimming declaration in the same block
  expect(css).toMatch(/\[data-commute="beyond"\]\s*\{[^}]*opacity:\s*0?\.25/);

  // hover-restore is part of the contract too — it died in the same purge
  expect(css).toMatch(/\[data-commute="beyond"\]:hover\s*\{[^}]*opacity:\s*0?\.6/);

  // keep the existing negative assertions
  expect(css).not.toContain('.commute-filtered-out');
});
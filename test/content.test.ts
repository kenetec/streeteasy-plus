// content.ts registers its message listener as a side effect of being
// imported (see test/log.test.ts for the same pattern), so each test resets
// modules and re-imports it to bind against a fresh chrome mock (test/
// setup.ts reinstalls that mock before every test).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { APPLY_FILTER } from '../src/lib/messages';
import { showBanner } from '../src/content/banner';
import type { CommuteSettings, GetIsochroneResponse } from '../src/types';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/search-results.html'
);
const fixtureHtml = readFileSync(fixturePath, 'utf8');

const settings: CommuteSettings = {
  workAddress: '350 5th Ave, New York, NY',
  maxMinutes: 30,
  mode: 'transit',
};

const RESOLVED_ADDRESS = '350 5th Ave, New York, NY 10118, USA';

const ALL_ENCOMPASSING_RESPONSE: GetIsochroneResponse = {
  ok: true,
  polygon: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-75, 40],
          [-72, 40],
          [-72, 42],
          [-75, 42],
          [-75, 40],
        ],
      ],
    ],
  },
  resolvedAddress: RESOLVED_ADDRESS,
};

afterEach(() => {
  document.body.innerHTML = '';
});

/** Imports content.ts fresh and returns the listener it registers. */
async function loadContentScriptListener(): Promise<(msg: unknown) => void> {
  vi.resetModules();
  await import('../src/content/content');
  const addListenerMock = vi.mocked(chrome.runtime.onMessage.addListener);
  const lastCall = addListenerMock.mock.calls.at(-1);
  const listener = lastCall?.[0];
  if (typeof listener !== 'function') {
    throw new Error('content script did not register an onMessage listener');
  }
  return listener as (msg: unknown) => void;
}

describe('content script success path (smoke)', () => {
  it('classifies real fixture cards and replaces a stale error banner with the resolved-address confirmation', async () => {
    // The fixture's cards + JSON-LD script live in <body> (verified in
    // PR #7), so this is a faithful reproduction of the live page.
    const parsedFixture = new DOMParser().parseFromString(
      fixtureHtml,
      'text/html'
    );
    document.body.innerHTML = parsedFixture.body.innerHTML;
    showBanner('stale error from a previous failed attempt');

    // chrome.runtime.sendMessage's @types/chrome signature is heavily
    // overloaded, so vi.mocked can't infer the Promise-returning overload
    // this content script actually uses; go through unknown instead.
    (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue(
      ALL_ENCOMPASSING_RESPONSE
    );

    const listener = await loadContentScriptListener();
    listener({ type: APPLY_FILTER, settings });

    // A failed Apply followed by a successful one must end with the ACTIVE
    // banner, not the stale error — this is the classification PR's
    // stale-banner fix, now via showBanner (which always removes any
    // existing banner first) rather than removeBanner.
    await vi.waitFor(() => {
      const banner = document.getElementById('commute-filter-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain(RESOLVED_ADDRESS);
    });
    expect(document.querySelectorAll('#commute-filter-banner').length).toBe(1);
    expect(document.getElementById('commute-filter-banner')?.textContent).not
      .toContain('stale error');

    const classified = document.querySelectorAll('[data-commute]');
    expect(classified.length).toBeGreaterThanOrEqual(10);
    // The all-encompassing polygon should mark every located card "within".
    expect(document.querySelectorAll('[data-commute="beyond"]').length).toBe(
      0
    );
  });
});

describe('content script MutationObserver wiring', () => {
  // Fake timers throughout: the observer's debounce uses setTimeout, and
  // vi.advanceTimersByTimeAsync(0) is also how the fire-and-forget
  // applyFilter() call (the listener never awaits it) gets a chance to
  // settle its single internal await — verified empirically in the
  // implementation work for this PR.
  it('re-classifies a card whose data-commute/badge were wiped by a simulated React replacement', async () => {
    vi.useFakeTimers();
    try {
      const parsedFixture = new DOMParser().parseFromString(
        fixtureHtml,
        'text/html'
      );
      document.body.innerHTML = parsedFixture.body.innerHTML;

      (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue(
        ALL_ENCOMPASSING_RESPONSE
      );

      const listener = await loadContentScriptListener();
      listener({ type: APPLY_FILTER, settings });
      await vi.advanceTimersByTimeAsync(0);

      const cards = [...document.querySelectorAll('[data-commute]')];
      expect(cards.length).toBeGreaterThanOrEqual(10);

      // Simulate React replacing a card's DOM node: clone one, strip the
      // attribute/badge our first classify+decorate pass added, and swap
      // it in for the original — exactly the field-observed failure mode
      // this PR fixes.
      const original = cards[0]!;
      const replacement = original.cloneNode(true) as Element;
      replacement.removeAttribute('data-commute');
      replacement.querySelector('[data-commute-badge]')?.remove();
      original.replaceWith(replacement);
      expect(replacement.hasAttribute('data-commute')).toBe(false);

      await vi.advanceTimersByTimeAsync(250);

      expect(replacement.getAttribute('data-commute')).toBe('within');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not stack a second observer on a subsequent successful Apply', async () => {
    vi.useFakeTimers();
    try {
      const parsedFixture = new DOMParser().parseFromString(
        fixtureHtml,
        'text/html'
      );
      document.body.innerHTML = parsedFixture.body.innerHTML;

      (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue(
        ALL_ENCOMPASSING_RESPONSE
      );
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      const listener = await loadContentScriptListener();
      listener({ type: APPLY_FILTER, settings });
      await vi.advanceTimersByTimeAsync(0);

      // A second successful Apply (module state persists across calls to
      // the same registered listener) must replace, not stack, the
      // observer — startFilterObserver disconnects the first handle.
      listener({ type: APPLY_FILTER, settings });
      await vi.advanceTimersByTimeAsync(0);

      consoleLog.mockClear();
      document.body.appendChild(document.createElement('div'));
      await vi.advanceTimersByTimeAsync(250);

      // Two live observers would each debounce independently and log their
      // own "re-classified" line for the same single mutation.
      const reclassifyLogLines = consoleLog.mock.calls.filter((args) =>
        args.some(
          (arg) =>
            typeof arg === 'string' &&
            arg.includes('re-classified after DOM change')
        )
      );
      expect(reclassifyLogLines.length).toBe(1);

      consoleLog.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

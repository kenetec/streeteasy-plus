import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeBanner, showBanner } from '../src/content/banner';
import { OWNED_ATTR } from '../src/content/decorate';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('showBanner / removeBanner', () => {
  it('creates the banner element with the expected id and text', () => {
    showBanner('hello');
    const el = document.getElementById('commute-filter-banner');
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe('hello');
  });

  it('stamps OWNED_ATTR on the banner it creates', () => {
    showBanner('hello');
    expect(
      document.getElementById('commute-filter-banner')?.hasAttribute(OWNED_ATTR)
    ).toBe(true);
  });

  it('leaves exactly one banner when called twice', () => {
    showBanner('first');
    showBanner('second');
    const banners = document.querySelectorAll('#commute-filter-banner');
    expect(banners.length).toBe(1);
    expect(banners[0]?.textContent).toBe('second');
  });

  it('updates in place for different text: same element identity, new text', () => {
    showBanner('first');
    const before = document.getElementById('commute-filter-banner');

    showBanner('second');
    const after = document.getElementById('commute-filter-banner');

    expect(after).toBe(before);
    expect(after?.textContent).toBe('second');
  });

  it('showing the same text twice produces zero DOM mutations (the quiescence property the observer feedback-loop fix depends on)', async () => {
    // This is the load-bearing assertion for this PR: showBanner used to
    // remove-and-recreate unconditionally, and that childList mutation on
    // document.body is exactly what fed the reclassify -> render ->
    // mutation -> reclassify loop once the observer started re-rendering
    // the banner on every re-classification. Identical text must be a
    // true no-op at the DOM level, not just "same visible result".
    vi.useFakeTimers();
    try {
      showBanner('steady state');
      const before = document.getElementById('commute-filter-banner');

      let mutationCount = 0;
      const observer = new MutationObserver((records) => {
        mutationCount += records.length;
      });
      observer.observe(document.body, { childList: true, subtree: true });

      showBanner('steady state');
      await vi.advanceTimersByTimeAsync(0);

      expect(mutationCount).toBe(0);
      expect(document.getElementById('commute-filter-banner')).toBe(before);

      observer.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes the banner', () => {
    showBanner('hello');
    removeBanner();
    expect(document.getElementById('commute-filter-banner')).toBeNull();
  });

  it('is a no-op when no banner is present', () => {
    expect(() => removeBanner()).not.toThrow();
  });
});

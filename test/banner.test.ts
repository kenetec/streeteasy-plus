import { afterEach, describe, expect, it } from 'vitest';
import { removeBanner, showBanner } from '../src/content/banner';

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

  it('leaves exactly one banner when called twice', () => {
    showBanner('first');
    showBanner('second');
    const banners = document.querySelectorAll('#commute-filter-banner');
    expect(banners.length).toBe(1);
    expect(banners[0]?.textContent).toBe('second');
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

import { describe, expect, it } from 'vitest';
import { cacheKey } from '../src/lib/cache';
import type { CommuteSettings } from '../src/types';

function settings(overrides: Partial<CommuteSettings> = {}): CommuteSettings {
  return {
    workAddress: '350 5th Ave',
    maxMinutes: 30,
    mode: 'transit',
    ...overrides,
  };
}

describe('cacheKey', () => {
  it('has the iso:{address}:{minutes}:{mode} shape', () => {
    expect(cacheKey(settings())).toBe('iso:350 5th ave:30:transit');
  });

  it('normalizes trivially different addresses to the same key', () => {
    const a = cacheKey(settings({ workAddress: '350 5th Ave ' }));
    const b = cacheKey(settings({ workAddress: '350 5th ave' }));
    expect(a).toBe(b);
  });

  it('produces different keys for different minutes', () => {
    const a = cacheKey(settings({ maxMinutes: 30 }));
    const b = cacheKey(settings({ maxMinutes: 45 }));
    expect(a).not.toBe(b);
  });

  it('produces different keys for different modes', () => {
    const a = cacheKey(settings({ mode: 'transit' }));
    const b = cacheKey(settings({ mode: 'walk' }));
    expect(a).not.toBe(b);
  });
});

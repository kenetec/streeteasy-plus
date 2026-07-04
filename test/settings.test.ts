import { describe, expect, it } from 'vitest';
import { clampMinutes, validateSettings } from '../src/popup/settings';

describe('clampMinutes', () => {
  it('clamps values above 60 down to 60', () => {
    expect(clampMinutes(90)).toBe(60);
  });

  it('clamps 0 up to 1', () => {
    expect(clampMinutes(0)).toBe(1);
  });

  it('clamps NaN up to 1', () => {
    expect(clampMinutes(Number.NaN)).toBe(1);
  });

  it('floors non-integer values', () => {
    expect(clampMinutes(45.7)).toBe(45);
  });
});

describe('validateSettings', () => {
  it('rejects an empty address', () => {
    expect(
      validateSettings({ workAddress: '', maxMinutes: 30, mode: 'transit' })
    ).toBeNull();
  });

  it('rejects a whitespace-only address', () => {
    expect(
      validateSettings({ workAddress: '   ', maxMinutes: 30, mode: 'transit' })
    ).toBeNull();
  });

  it('trims the address', () => {
    const result = validateSettings({
      workAddress: '  350 5th Ave  ',
      maxMinutes: 30,
      mode: 'transit',
    });
    expect(result?.workAddress).toBe('350 5th Ave');
  });

  it('preserves the travel mode', () => {
    const result = validateSettings({
      workAddress: '350 5th Ave',
      maxMinutes: 30,
      mode: 'bicycle',
    });
    expect(result?.mode).toBe('bicycle');
  });

  it('clamps maxMinutes through the same rules as clampMinutes', () => {
    const result = validateSettings({
      workAddress: '350 5th Ave',
      maxMinutes: 90,
      mode: 'transit',
    });
    expect(result?.maxMinutes).toBe(60);
  });
});

// Pure popup-form validation — no DOM, no chrome APIs.

import type { CommuteSettings, TravelMode } from '../types';

export interface RawSettingsInput {
  workAddress: string;
  maxMinutes: number;
  mode: TravelMode;
}

/**
 * Clamp to Geoapify's 1-60 minute isochrone range (design doc §10).
 * Non-numeric input (NaN) becomes 1, same as the original `|| 0` fallback
 * feeding into Math.max(1, ...).
 */
export function clampMinutes(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(60, Math.max(1, Math.floor(value)));
}

/** Returns null when the address is empty/whitespace-only. */
export function validateSettings(
  input: RawSettingsInput
): CommuteSettings | null {
  const workAddress = input.workAddress.trim();
  const maxMinutes = clampMinutes(input.maxMinutes);
  if (!workAddress) return null;
  return { workAddress, maxMinutes, mode: input.mode };
}

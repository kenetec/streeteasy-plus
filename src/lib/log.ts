// Debug logging gated by the __DEBUG__ build-time flag (see env.d.ts and
// scripts/build.mjs). `.bind(console, PREFIX)` keeps DevTools' file:line
// attribution pointing at the call site instead of this module.

declare const __DEBUG__: boolean;

const PREFIX = '[commute-filter]';

export const log: (...args: unknown[]) => void =
  __DEBUG__ ? console.log.bind(console, PREFIX) : () => {};

export const warn: (...args: unknown[]) => void =
  __DEBUG__ ? console.warn.bind(console, PREFIX) : () => {};

// error is ALWAYS active — real failures must be visible even in
// non-debug builds.
export const error: (...args: unknown[]) => void =
  console.error.bind(console, PREFIX);

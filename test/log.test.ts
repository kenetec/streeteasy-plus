import { describe, expect, it, vi } from 'vitest';

// __DEBUG__ is fixed to 'true' in vitest.config.ts, so this suite only
// exercises the "debug on" branch. The "off" branch (where log/warn are
// bound to no-ops at module load because __DEBUG__ is a real build-time
// false) isn't reachable from a test run — that's verified by inspecting
// the built bundles instead (see build docs / acceptance criteria), not by
// a unit test.
//
// log.ts does `console.log.bind(console, PREFIX)` at *module load* time, so
// a spy installed after the module is already imported won't be seen by the
// bound function. Each test below resets modules and re-imports log.ts
// after the spy is in place so the bind captures the spy.

describe('log helper', () => {
  it('log forwards args to console.log with the prefix', async () => {
    vi.resetModules();
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { log } = await import('../src/lib/log');

    log('hello', { a: 1 });

    expect(consoleLog).toHaveBeenCalledWith('[commute-filter]', 'hello', { a: 1 });

    consoleLog.mockRestore();
  });

  it('warn forwards args to console.warn with the prefix', async () => {
    vi.resetModules();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { warn } = await import('../src/lib/log');

    warn('careful', 42);

    expect(consoleWarn).toHaveBeenCalledWith('[commute-filter]', 'careful', 42);

    consoleWarn.mockRestore();
  });

  it('error forwards args to console.error with the prefix regardless of debug state', async () => {
    vi.resetModules();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { error } = await import('../src/lib/log');

    error('boom', new Error('oops'));

    expect(consoleError).toHaveBeenCalledWith(
      '[commute-filter]',
      'boom',
      new Error('oops')
    );

    consoleError.mockRestore();
  });

  it('exposes log, warn, and error as callables', async () => {
    const { error, log, warn } = await import('../src/lib/log');
    expect(typeof log).toBe('function');
    expect(typeof warn).toBe('function');
    expect(typeof error).toBe('function');
  });
});

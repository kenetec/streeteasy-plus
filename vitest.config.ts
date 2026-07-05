import { defineConfig } from 'vitest/config';

export default defineConfig({
  // __DEBUG__ is normally injected by scripts/build.mjs at build time; tests
  // don't go through that build, so we fix it to 'true' here to exercise the
  // log/warn code paths. This can't cover the compiled-out "false" branch —
  // see test/log.test.ts for that limitation.
  define: {
    __DEBUG__: 'true',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});

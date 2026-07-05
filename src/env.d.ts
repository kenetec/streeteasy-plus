// Injected by scripts/build.mjs via esbuild's `define`, from the
// GEOAPIFY_API_KEY value in a repo-root .env file (empty string if none is
// present, e.g. in CI). Referenced only in src/background.ts.
declare const __GEOAPIFY_API_KEY__: string;

// Injected by scripts/build.mjs from the DEBUG value in a repo-root .env
// file ('true' -> true, anything else/absent -> false). Gates src/lib/log.ts.
declare const __DEBUG__: boolean;

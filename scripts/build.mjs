import { build, context } from 'esbuild';
import { cpSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

// Hand-rolled .env parser — a missing file (e.g. in CI) just means no
// overrides, not a build failure.
function loadEnv() {
  const env = {};
  let contents;
  try {
    contents = readFileSync(path.join(root, '.env'), 'utf8');
  } catch {
    return env;
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();

const entryPoints = {
  background: 'src/background.ts',
  'content/content': 'src/content/content.ts',
  'popup/popup': 'src/popup/popup.ts',
};

function copyStaticAssets() {
  mkdirSync(dist, { recursive: true });
  cpSync(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
  mkdirSync(path.join(dist, 'content'), { recursive: true });
  cpSync(path.join(root, 'src/content/content.css'), path.join(dist, 'content/content.css'));
  mkdirSync(path.join(dist, 'popup'), { recursive: true });
  cpSync(path.join(root, 'src/popup/popup.html'), path.join(dist, 'popup/popup.html'));
  cpSync(path.join(root, 'src/popup/popup.css'), path.join(dist, 'popup/popup.css'));
}

const buildOptions = {
  entryPoints,
  entryNames: '[dir]/[name]',
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  sourcemap: true,
  logLevel: 'info',
  // Needed for __DEBUG__-gated code to actually fold away (see src/lib/log.ts
  // and its call sites) — without it esbuild substitutes the constant but
  // leaves `false ? a : b` and `false && expr` unsimplified in the output.
  minifySyntax: true,
  define: {
    __GEOAPIFY_API_KEY__: JSON.stringify(env.GEOAPIFY_API_KEY ?? ''),
    __DEBUG__: JSON.stringify(env.DEBUG === 'true'),
  },
};

rmSync(dist, { recursive: true, force: true });
copyStaticAssets();

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('[build] watching for changes...');
} else {
  await build(buildOptions);
}

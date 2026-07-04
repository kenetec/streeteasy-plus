import { build, context } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

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

/**
 * Consciousness Swipe — esbuild pipeline.
 *
 * Produces a ready-to-load Chrome/Firefox extension in dist/:
 *   dist/manifest.json          (paths patched to dist layout)
 *   dist/background.js          (ESM, bundled — MV3 service worker)
 *   dist/content/...            (IIFE, bundled — content scripts)
 *   dist/popup/...              (IIFE + static HTML/CSS)
 *   dist/icons/...              (copied)
 *
 * Usage:
 *   node build.js           # One-shot production build
 *   node build.js --watch   # Rebuild on file changes (dev mode)
 */

import * as esbuild from 'esbuild';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'fs';

const isWatch = process.argv.includes('--watch');
const OUT_DIR = 'dist';

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Content scripts — loaded as plain scripts by Chrome, must be IIFE */
const CONTENT_ENTRIES = {
  'content/detector':            'src/content/detector.js',
  'content/oof_parser':          'src/content/oof_parser.js',
  'content/injector':            'src/content/injector.js',
  'content/scrapers/chatgpt':    'src/content/scrapers/chatgpt.js',
  'content/scrapers/claude':     'src/content/scrapers/claude.js',
  'content/scrapers/gemini':     'src/content/scrapers/gemini.js',
  'content/scrapers/cursor':     'src/content/scrapers/cursor.js',
  'content/scrapers/windsurf':   'src/content/scrapers/windsurf.js',
};

/** Popup scripts — IIFE, reference chrome.* globals */
const POPUP_ENTRIES = {
  'popup/popup':   'src/popup/popup.js',
  'popup/options': 'src/popup/options.js',
};

/** Background service worker — MV3 supports ESM, keep as module */
const BACKGROUND_ENTRIES = {
  background: 'src/background.js',
};

// ---------------------------------------------------------------------------
// esbuild configs
// ---------------------------------------------------------------------------

/** Shared base options */
const BASE = {
  bundle: true,
  minify: false,
  sourcemap: process.env.NODE_ENV !== 'production',
  outdir: OUT_DIR,
  logLevel: 'info',
};

const contentConfig = {
  ...BASE,
  entryPoints: { ...CONTENT_ENTRIES, ...POPUP_ENTRIES },
  format: 'iife',
};

const backgroundConfig = {
  ...BASE,
  entryPoints: BACKGROUND_ENTRIES,
  format: 'esm',
};

// ---------------------------------------------------------------------------
// Static asset copy + manifest patch
// ---------------------------------------------------------------------------

function copyStatic() {
  // Icons
  mkdirSync(`${OUT_DIR}/icons`, { recursive: true });
  if (existsSync('icons')) {
    cpSync('icons', `${OUT_DIR}/icons`, { recursive: true });
  }

  // Popup HTML + CSS (reference dist-relative popup/ paths)
  mkdirSync(`${OUT_DIR}/popup`, { recursive: true });
  for (const file of ['popup.html', 'popup.css', 'options.html']) {
    const src = `src/popup/${file}`;
    if (existsSync(src)) cpSync(src, `${OUT_DIR}/popup/${file}`);
  }

  // Patch manifest.json: update script paths to dist layout
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

  // Background: strip src/ prefix
  manifest.background.service_worker = 'background.js';

  // Content scripts: strip leading src/ from each path
  manifest.content_scripts = manifest.content_scripts.map((cs) => ({
    ...cs,
    js: cs.js.map((p) => p.replace(/^src\//, '')),
  }));

  // Popup and options: update to dist popup/ paths
  if (manifest.action?.default_popup) {
    manifest.action.default_popup = manifest.action.default_popup
      .replace(/^src\/popup\//, 'popup/');
  }
  if (manifest.options_page) {
    manifest.options_page = manifest.options_page
      .replace(/^src\/popup\//, 'popup/');
  }

  writeFileSync(
    `${OUT_DIR}/manifest.json`,
    JSON.stringify(manifest, null, 2),
  );

  console.log('✓ Static assets copied and manifest patched');
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

if (isWatch) {
  console.log('🔄 Consciousness Swipe — watch mode\n');

  const ctx1 = await esbuild.context(contentConfig);
  const ctx2 = await esbuild.context(backgroundConfig);

  copyStatic();

  await ctx1.watch();
  await ctx2.watch();

  console.log('Watching for changes… (Ctrl+C to stop)');
} else {
  console.log('🔨 Consciousness Swipe — building dist/\n');

  await esbuild.build(contentConfig);
  await esbuild.build(backgroundConfig);
  copyStatic();

  console.log('\n✅ Build complete → dist/');
  console.log('   Load dist/ as an unpacked extension in chrome://extensions');
}

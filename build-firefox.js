/**
 * Consciousness Swipe — Firefox AMO build script.
 *
 * Differences from the Chrome build (build.js):
 *   - Background bundled as IIFE (no ESM service worker requirement)
 *   - "type": "module" removed from background in manifest
 *   - browser_specific_settings.gecko added (required by AMO)
 *   - options_ui used instead of options_page (Firefox preference)
 *
 * Outputs:
 *   dist-firefox/          Ready-to-load Firefox extension
 *   consciousness-swipe-firefox-0.2.0.xpi   Extension package (AMO upload)
 *   consciousness-swipe-source-0.2.0.zip    Source code (AMO source review)
 *
 * Usage:
 *   node build-firefox.js
 */

import * as esbuild from 'esbuild';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'fs';
import { execSync } from 'child_process';

const OUT_DIR = 'dist-firefox';
const VERSION = '0.2.0';

// ---------------------------------------------------------------------------
// Entry points (same as Chrome build)
// ---------------------------------------------------------------------------

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

const POPUP_ENTRIES = {
  'popup/popup':   'src/popup/popup.js',
  'popup/options': 'src/popup/options.js',
};

// Background: IIFE for Firefox (avoids ESM service worker requirement)
const BACKGROUND_ENTRIES = {
  background: 'src/background.js',
};

// ---------------------------------------------------------------------------
// esbuild configs
// ---------------------------------------------------------------------------

const BASE = {
  bundle: true,
  minify: false,
  sourcemap: false, // No source maps in store submission
  outdir: OUT_DIR,
  logLevel: 'info',
};

const contentConfig = {
  ...BASE,
  entryPoints: { ...CONTENT_ENTRIES, ...POPUP_ENTRIES },
  format: 'iife',
};

// Firefox: bundle background as IIFE (no "type": "module" needed)
const backgroundConfig = {
  ...BASE,
  entryPoints: BACKGROUND_ENTRIES,
  format: 'iife',
};

// ---------------------------------------------------------------------------
// Static asset copy + Firefox manifest patch
// ---------------------------------------------------------------------------

function copyStatic() {
  // Icons
  mkdirSync(`${OUT_DIR}/icons`, { recursive: true });
  if (existsSync('icons')) {
    cpSync('icons', `${OUT_DIR}/icons`, { recursive: true });
  }

  // Popup HTML + CSS
  mkdirSync(`${OUT_DIR}/popup`, { recursive: true });
  for (const file of ['popup.html', 'popup.css', 'options.html']) {
    const src = `src/popup/${file}`;
    if (existsSync(src)) cpSync(src, `${OUT_DIR}/popup/${file}`);
  }

  // Patch manifest for Firefox
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

  // Background: strip src/ prefix and remove "type": "module" (IIFE doesn't need it)
  manifest.background = {
    service_worker: 'background.js',
    // No "type": "module" — IIFE bundle works as classic script in Firefox
  };

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

  // Firefox: use options_ui instead of options_page
  delete manifest.options_page;
  manifest.options_ui = {
    page: 'popup/options.html',
    open_in_tab: true,
  };

  // Firefox: required gecko settings for AMO submission
  manifest.browser_specific_settings = {
    gecko: {
      id: 'consciousness-swipe@smilintux.org',
      strict_min_version: '109.0',
    },
  };

  writeFileSync(
    `${OUT_DIR}/manifest.json`,
    JSON.stringify(manifest, null, 2),
  );

  console.log('✓ Static assets copied and Firefox manifest patched');
}

// ---------------------------------------------------------------------------
// Package creation
// ---------------------------------------------------------------------------

function createPackages() {
  const xpiName = `consciousness-swipe-firefox-${VERSION}.xpi`;
  const srcZipName = `consciousness-swipe-source-${VERSION}.zip`;

  // Extension XPI (just a zip of dist-firefox/)
  if (existsSync(xpiName)) rmSync(xpiName);
  execSync(`cd ${OUT_DIR} && zip -r ../${xpiName} . -x "*.map"`, { stdio: 'inherit' });
  console.log(`✓ Extension package: ${xpiName}`);

  // Source code zip (required by AMO for bundled/compiled code)
  if (existsSync(srcZipName)) rmSync(srcZipName);
  execSync(
    `zip -r ${srcZipName} src/ manifest.json build.js build-firefox.js package.json package-lock.json ` +
    `-x "node_modules/*" -x "*.xpi" -x "*.zip"`,
    { stdio: 'inherit' }
  );
  console.log(`✓ Source code zip: ${srcZipName}`);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

console.log('🦊 Consciousness Swipe — Firefox AMO build\n');

// Clean output dir
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

await esbuild.build(contentConfig);
await esbuild.build(backgroundConfig);
copyStatic();
createPackages();

console.log(`\n✅ Firefox build complete!`);
console.log(`   Extension: consciousness-swipe-firefox-${VERSION}.xpi`);
console.log(`   Source:    consciousness-swipe-source-${VERSION}.zip`);
console.log(`   Load dist-firefox/ as temporary add-on: about:debugging → This Firefox`);

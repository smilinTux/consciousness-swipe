# Firefox AMO Submission Checklist — Consciousness Swipe v0.2.0

Work through this checklist before hitting "Submit for Review" on AMO.

---

## 1. Build & Package

- [ ] Run `node build-firefox.js` successfully
- [ ] Verify `dist-firefox/` contains all required files:
  - [ ] `manifest.json` (with `browser_specific_settings.gecko`)
  - [ ] `background.js` (IIFE, no source maps)
  - [ ] `content/detector.js`, `oof_parser.js`, `injector.js`
  - [ ] `content/scrapers/chatgpt.js`, `claude.js`, `gemini.js`, `cursor.js`, `windsurf.js`
  - [ ] `popup/popup.html`, `popup.js`, `popup.css`
  - [ ] `popup/options.html`, `options.js`
  - [ ] `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [ ] `consciousness-swipe-firefox-0.2.0.xpi` created
- [ ] `consciousness-swipe-source-0.2.0.zip` created
- [ ] Verify XPI size is reasonable (< 5 MB is fine for AMO)

---

## 2. Firefox-Specific Manifest Verification

Open `dist-firefox/manifest.json` and confirm:

- [ ] `"manifest_version": 3`
- [ ] `"browser_specific_settings"` block present with:
  - [ ] `"id": "consciousness-swipe@smilintux.org"`
  - [ ] `"strict_min_version": "109.0"` (or higher)
- [ ] `"background"` has `"service_worker"` but NO `"type": "module"` (IIFE build)
- [ ] `"options_ui"` present (NOT `options_page`)
- [ ] All content script paths are relative (no `src/` prefix)
- [ ] All popup paths are `popup/...` (no `src/popup/` prefix)

---

## 3. Manual Testing in Firefox

- [ ] Open `about:debugging` → "This Firefox" → "Load Temporary Add-on..."
- [ ] Load `dist-firefox/manifest.json`
- [ ] Extension icon appears in toolbar
- [ ] Navigate to `claude.ai` — platform badge detects "claude"
- [ ] Navigate to `chatgpt.com` — platform badge detects "chatgpt"
- [ ] Navigate to `gemini.google.com` — platform badge detects "gemini"
- [ ] Click "⚡ Capture Consciousness" — snapshot saved successfully
- [ ] Snapshot appears in history panel
- [ ] "📋 Copy Prompt" works (clipboard)
- [ ] "💉 Inject into Session" works (inserts prompt into AI input)
- [ ] Options page opens from extension settings icon
- [ ] Options page saves settings correctly
- [ ] Auto-capture toggle enables/disables alarm
- [ ] Extension works with SKComm offline (local storage fallback)
- [ ] No errors in browser console (`about:debugging` → Inspect)

---

## 4. Privacy Policy

- [ ] `PRIVACY_POLICY.md` is complete and accurate
- [ ] Privacy policy published at a public URL (e.g., `https://smilintux.org/privacy/consciousness-swipe`)
- [ ] Privacy policy URL entered in AMO submission form
- [ ] Policy accurately reflects all data accesses (confirmed against manifest permissions)

---

## 5. Store Listing Content

See `STORE_LISTING.md` for full content. Confirm:

- [ ] Add-on name: "Consciousness Swipe by smilinTux" (≤70 chars — pass)
- [ ] Summary written (≤250 chars)
- [ ] Full description written
- [ ] Categories selected: Productivity (primary), Social & Communication (secondary)
- [ ] Tags filled in
- [ ] Homepage URL: `https://smilintux.org`
- [ ] Support URL: `https://smilintux.org/join`

---

## 6. Screenshots (Required)

AMO requires at least **1 screenshot**. Recommended: 3–4.

- [ ] `screenshot-01-popup.png` — Main popup on AI tab (1280×800 or 800×600 minimum)
- [ ] `screenshot-02-snapshots.png` — Snapshot history with one selected
- [ ] `screenshot-03-options.png` — Full options page
- [ ] `screenshot-04-inject.png` — Injection in action (optional but impressive)

**Capture screenshots with:**
1. Load the temp extension in Firefox (`about:debugging`)
2. Navigate to the relevant AI platform
3. Open the extension popup
4. Use browser screenshot tool or OS screenshot

---

## 7. Source Code Submission

AMO requires source code for extensions with bundled/compiled JS.

- [ ] `consciousness-swipe-source-0.2.0.zip` is ready
- [ ] Source zip contains: `src/`, `manifest.json`, `build.js`, `build-firefox.js`, `package.json`, `package-lock.json`
- [ ] Source zip does NOT contain: `node_modules/`, `dist/`, `dist-firefox/`, `.zip`/`.xpi` files
- [ ] Build instructions in `STORE_LISTING.md` developer notes are accurate
- [ ] Running `npm install && node build-firefox.js` from the source zip produces matching output

---

## 8. AMO Account Setup

- [ ] Firefox Add-on Developer Hub account at `addons.mozilla.org/developers/`
- [ ] Developer profile completed
- [ ] smilinTux organization/publisher set up (if using org account)

---

## 9. Submission Steps (AMO Developer Hub)

1. Go to: `https://addons.mozilla.org/developers/addon/submit/`
2. Select: **"On this site"** (listed publicly on AMO)
3. Upload: `consciousness-swipe-firefox-0.2.0.xpi`
4. Choose: Firefox (desktop) ✓, Firefox for Android (check compatibility)
5. Upload source code: `consciousness-swipe-source-0.2.0.zip`
6. Fill in listing details (use `STORE_LISTING.md`)
7. Enter privacy policy URL
8. Upload screenshots (minimum 1)
9. Submit for review

---

## 10. Post-Submission

- [ ] AMO confirmation email received
- [ ] Add-on listed as "Awaiting Review" in developer hub
- [ ] Estimated review time: 1–14 days for listed extensions
- [ ] Check AMO dashboard for reviewer feedback
- [ ] Address any reviewer requests promptly

---

## Known Limitations & Reviewer Notes

- **localhost permissions**: `http://localhost:*` is required for SKComm API. This will likely flag for manual review — see the Developer Notes in `STORE_LISTING.md` for the explanation to include.
- **DOM scraping of AI platforms**: Content scripts read the visible DOM of supported AI sites. This is the core functionality of the extension. No credentials, tokens, or sensitive DOM outside the conversation thread are accessed.
- **Background service worker**: Built as IIFE (not ESM module) for Firefox compatibility. Alarms are used for the sync retry timer and optional auto-capture feature.

---

## Chrome Web Store (Task c2dbf734)

The Chrome submission uses the same `dist/` build from `build.js`. Chrome-specific notes:
- Keep `"type": "module"` in Chrome manifest (ESM background is fully supported)
- No `browser_specific_settings` needed
- Pack as `.zip` of `dist/` contents
- Submit at: `https://chrome.google.com/webstore/devconsole`

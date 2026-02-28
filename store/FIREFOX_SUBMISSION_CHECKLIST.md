# Firefox AMO Submission Checklist — Consciousness Swipe v0.2.0

Work through each section before submitting on the AMO Developer Hub.
See also: `SUBMISSION_CHECKLIST.md` (Chrome Web Store version).

---

## A. Extension Package

- [ ] `dist-firefox/` is fully built: `node build-firefox.js`
- [ ] `dist-firefox/manifest.json` has correct version: `0.2.0`
- [ ] `dist-firefox/manifest.json` has correct `name`: `"Consciousness Swipe by smilinTux"`
- [ ] No source maps in XPI (build-firefox.js always builds with `sourcemap: false`)
- [ ] No `node_modules/` in XPI
- [ ] Icon files present: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [ ] XPI created: `consciousness-swipe-firefox-0.2.0.xpi`
- [ ] Source zip created: `consciousness-swipe-source-0.2.0.zip`
- [ ] XPI is under 5MB (AMO practical limit)
- [ ] Source zip contains `src/`, `manifest.json`, `build.js`, `build-firefox.js`, `package.json`, `package-lock.json`
- [ ] Source zip does NOT contain `node_modules/`, `dist/`, `dist-firefox/`, `.zip`, `.xpi`

**Verify XPI:**
```bash
unzip -l consciousness-swipe-firefox-0.2.0.xpi | head -30
```

---

## B. Firefox Manifest Checks

Open `dist-firefox/manifest.json` and confirm:

- [ ] `manifest_version`: 3
- [ ] `version`: `0.2.0` (matches `package.json`)
- [ ] `description` is present and under 250 characters (AMO summary limit)
- [ ] `homepage_url` set to `https://smilintux.org`
- [ ] `browser_specific_settings.gecko.id`: `"consciousness-swipe@smilintux.org"`
- [ ] `browser_specific_settings.gecko.strict_min_version`: `"109.0"` or higher
- [ ] Background has `"service_worker"` but NO `"type": "module"` (IIFE build)
- [ ] `options_ui` present with `"page": "popup/options.html"` (NOT `options_page`)
- [ ] `options_ui.open_in_tab`: `true`
- [ ] All `host_permissions` are minimal and justified
- [ ] `localhost` host permission justified (optional local SKComm agent)
- [ ] No wildcard `<all_urls>` host permissions
- [ ] `default_popup` path: `popup/popup.html`
- [ ] Service worker path: `background.js`
- [ ] All content script paths are relative (no `src/` prefix)

---

## C. Store Listing Assets

- [ ] **Icon 64×64** — required by AMO (upload separately during submission)
- [ ] **Icon 128×128** — `icons/icon128.png` (in XPI, also upload separately)
- [ ] **Screenshot 1** (1280×800 or 800×600 min): Main popup — Capture button
- [ ] **Screenshot 2** (1280×800): Snapshot history list
- [ ] **Screenshot 3** (1280×800): Options page
- [ ] **Screenshot 4** (1280×800): Injection in action (optional)
- [ ] Screenshots are PNG (not JPEG)
- [ ] Minimum 1 screenshot uploaded (AMO requirement)

---

## D. Text Content

- [ ] **Add-on name**: `"Consciousness Swipe by smilinTux"` (≤70 chars — pass)
- [ ] **Summary** (≤250 chars): copied from `STORE_LISTING.md`
- [ ] **Full description**: copied from `STORE_LISTING.md`
- [ ] **Categories**: Productivity (primary), Social & Communication (secondary)
- [ ] **Tags**: ai, consciousness, chatgpt, claude, gemini, export, sync
- [ ] Description is in English
- [ ] No price claims that violate policies
- [ ] No claims of Mozilla endorsement
- [ ] Description accurately reflects extension functionality
- [ ] AI platform names (ChatGPT, Claude, Gemini) used factually as supported platforms

---

## E. Privacy & Permissions

- [ ] Privacy policy published at `https://smilintux.org/privacy/consciousness-swipe`
- [ ] Privacy policy URL entered in AMO submission form
- [ ] Permission justifications prepared (see `STORE_LISTING.md` "Developer Notes for Reviewer")
- [ ] `host_permissions` justification: each AI platform is a supported scraping target
- [ ] `localhost` justification: optional local SKComm API (gracefully degrades if absent)
- [ ] `scripting` justified: inject user-triggered prompt into AI input field
- [ ] `clipboardWrite` justified: Copy Prompt feature
- [ ] `alarms` justified: auto-capture interval and sync retry timer
- [ ] `storage` justified: snapshot history and user preferences stored locally
- [ ] Data collection declaration: no user data collected or transmitted externally

---

## F. AMO Policy Compliance

AMO Add-on Policies to verify:

- [ ] **Single purpose:** Extension does one thing (AI conversation export/restore)
- [ ] **No deceptive behavior:** Extension does what the description says
- [ ] **No user data misuse:** No undisclosed data collection or transmission
- [ ] **No malware:** No obfuscated code, no remote code execution
- [ ] **Accurate representation:** All platform support claims are genuine
- [ ] **DOM access scope:** Content scripts read only conversation DOM, not credentials
- [ ] **No bypassing authentication:** Extension reads public-facing conversation UI only
- [ ] **Manifest V3 compliant:** Extension uses MV3 (Firefox MV3 support ≥ 109)
- [ ] **No excessive permissions:** Each permission is minimal and justified
- [ ] **Source code reviewable:** Source zip can reproduce the XPI with `npm install && node build-firefox.js`

---

## G. Manual Testing in Firefox

- [ ] Open `about:debugging` → "This Firefox" → "Load Temporary Add-on..."
- [ ] Load `dist-firefox/manifest.json`
- [ ] Extension icon appears in toolbar
- [ ] Navigate to `claude.ai` → platform badge shows "claude"
- [ ] Navigate to `chatgpt.com` → platform badge shows "chatgpt"
- [ ] Navigate to `gemini.google.com` → platform badge shows "gemini"
- [ ] Click "Capture Consciousness" → snapshot saved and appears in list
- [ ] Select a snapshot → "Copy Prompt" → clipboard has prompt text
- [ ] Select a snapshot → "Inject into Session" → fills AI input field
- [ ] Options page opens from extension settings
- [ ] Options page saves settings (persist across popup close/open)
- [ ] Auto-capture toggle enables/disables alarm
- [ ] Extension works when SKComm is offline (localhost:9384 unreachable)
- [ ] No errors in Firefox console (`about:debugging` → Inspect)

---

## H. Source Code Submission

AMO requires source code for extensions with bundled/compiled JS.

- [ ] `consciousness-swipe-source-0.2.0.zip` is ready and complete
- [ ] `README.md` or `STORE_LISTING.md` contains build instructions for reviewer
- [ ] Running `npm install && node build-firefox.js` from the source zip produces matching output
- [ ] Build instructions: Node.js ≥ 18, run `npm install && node build-firefox.js`
- [ ] Output of build matches the submitted XPI (same file hashes)

---

## I. AMO Account Setup

- [ ] Firefox Add-on Developer Hub account at `addons.mozilla.org/developers/`
- [ ] Developer profile completed
- [ ] Publisher/organization name: `smilinTux`
- [ ] Support email configured

---

## J. Submission Steps (AMO Developer Hub)

1. Go to: `https://addons.mozilla.org/developers/addon/submit/`
2. Select: **"On this site"** (publicly listed on AMO)
3. Upload: `consciousness-swipe-firefox-0.2.0.xpi`
4. Select platforms: Firefox (desktop), optionally Firefox for Android
5. Upload source code: `consciousness-swipe-source-0.2.0.zip`
6. Fill in listing details (see `STORE_LISTING.md`)
7. Enter privacy policy URL
8. Upload screenshots (minimum 1)
9. Submit for review

---

## K. Post-Submission

- [ ] AMO confirmation email received
- [ ] Add-on listed as "Awaiting Review" in developer hub
- [ ] Estimated review time: 1–14 days for listed extensions
- [ ] Check AMO dashboard for reviewer feedback
- [ ] Address reviewer requests promptly

---

## Known Limitations & Reviewer Notes

- **localhost permissions**: `http://localhost:*` is required for the optional SKComm API. This will likely flag for manual review — the Developer Notes in `STORE_LISTING.md` explain the justification.
- **DOM scraping of AI platforms**: Content scripts read the visible conversation DOM of supported AI sites. This is the core functionality. No credentials, tokens, or sensitive DOM outside the conversation thread are accessed.
- **Background service worker**: Built as IIFE (not ESM module) for maximum Firefox compatibility. Alarms are used for sync retry timer and optional auto-capture.
- **Firefox MV3 quirks**: Background script bundled as IIFE; `options_ui` used instead of `options_page`; `browser_specific_settings` required for AMO submission.

---

## Quick Reference — Key AMO Policies

| Policy Area | Requirement |
|-------------|-------------|
| User data | Must disclose all data accessed and how it's used |
| Permissions | Must be minimal; each requires written justification |
| Source code | Must be able to reproduce the build from submitted source |
| Description | Must accurately describe extension functionality |
| Single purpose | One primary function only |
| Code quality | No obfuscated code; reviewer must be able to audit logic |
| Remote code | No fetching and executing remote JavaScript |

---

## Cross-Reference

- Chrome Web Store checklist: `store/SUBMISSION_CHECKLIST.md`
- Store listing copy: `store/STORE_LISTING.md`
- Privacy policy: `store/PRIVACY_POLICY.md`
- Developer account setup: `store/DEVELOPER_ACCOUNT_SETUP.md`

---

*Last updated: 2026-02-28*

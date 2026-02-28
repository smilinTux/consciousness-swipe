# Chrome Web Store Submission Checklist — Consciousness Swipe v0.2.0

Work through each section before submitting. Check off items as completed.

---

## A. Extension Package

- [ ] `dist/` is fully built: `NODE_ENV=production node build.js`
- [ ] `dist/manifest.json` has correct version: `0.2.0`
- [ ] `dist/manifest.json` has correct `name`: `"Consciousness Swipe by smilinTux"`
- [ ] No source maps in the ZIP (`.map` files excluded from dist)
- [ ] No `node_modules/` in the ZIP
- [ ] Icon files present: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [ ] ZIP created from the `dist/` directory contents (not the outer folder)
- [ ] ZIP filename: `consciousness-swipe-0.2.0.zip`
- [ ] ZIP is under 100MB (Chrome Web Store hard limit)

**Verify ZIP:**
```bash
unzip -l consciousness-swipe-0.2.0.zip | head -30
```

---

## B. Manifest Checks

- [ ] `manifest_version`: 3
- [ ] `version`: matches `package.json` version
- [ ] `description` is present and under 132 characters
- [ ] `homepage_url` set to `https://smilintux.org`
- [ ] All `host_permissions` are minimal and justified
- [ ] `localhost` host permission justified (optional local agent)
- [ ] No wildcard `<all_urls>` host permissions
- [ ] `default_popup` path is correct: `popup/popup.html`
- [ ] `options_page` path is correct: `popup/options.html`
- [ ] Service worker path correct: `background.js`
- [ ] All content script paths exist in the ZIP

---

## C. Store Listing Assets

- [ ] **Icon 128×128** — `icons/icon128.png` (in ZIP, also upload separately if requested)
- [ ] **Screenshot 1** (1280×800): Main popup — Capture button
- [ ] **Screenshot 2** (1280×800): Snapshot history list
- [ ] **Screenshot 3** (1280×800): Injection in action
- [ ] **Screenshot 4** (1280×800): Options page
- [ ] Screenshots are PNG (not JPEG) for best quality
- [ ] No screenshots contain Google branding that violates their policies
- [ ] Optional: Promotional tile (440×280 PNG)

---

## D. Text Content

- [ ] **Short description** (≤132 chars): copied from `STORE_LISTING.md`
- [ ] **Full description**: copied from `STORE_LISTING.md`
- [ ] Description is in English
- [ ] No price claims in description ("free", "no cost") that could violate policies
- [ ] No claims of Chrome/Google endorsement
- [ ] Description accurately reflects extension functionality
- [ ] No competitor brand names used improperly (ChatGPT, Claude, Gemini are listed as supported platforms — this is factual use, acceptable)

---

## E. Privacy & Permissions

- [ ] Privacy policy is published at a public URL
  - Target: `https://smilintux.org/privacy/consciousness-swipe`
- [ ] Privacy policy URL entered in store listing
- [ ] Permission justifications prepared (from `STORE_LISTING.md` "Developer Notes for Reviewer")
- [ ] Data collection declaration filled in (no user data collected)
- [ ] `host_permissions` justification text ready for reviewer
- [ ] `scripting` permission justified (inject user-triggered prompt only)
- [ ] `clipboardWrite` justified (Copy Prompt feature)
- [ ] `alarms` justified (auto-capture feature, optional)

---

## F. Policy Compliance

Chrome Web Store Program Policies to verify:

- [ ] **Single purpose:** Extension does exactly one thing (AI conversation export/restore)
- [ ] **No deceptive behavior:** Extension does what the description says
- [ ] **No user data misuse:** No undisclosed data collection or transmission
- [ ] **No malware:** Extension contains no obfuscated code, no remote code execution
- [ ] **Accurate representation:** All platform support claims (ChatGPT, Claude, etc.) are genuine
- [ ] **No policy violations regarding AI platform scraping:** Extension reads public DOM — not accessing private APIs or bypassing authentication
- [ ] **Manifest V3 compliant:** Extension uses MV3, not deprecated MV2
- [ ] **No excessive permissions:** Each permission is justified and minimal

---

## G. Functional Testing

Before submitting, test the extension manually:

- [ ] Load `dist/` as unpacked extension in Chrome
- [ ] Open ChatGPT with a test conversation → click Capture → snapshot appears in list
- [ ] Open Claude with a test conversation → click Capture → snapshot appears
- [ ] Open Gemini with a test conversation → click Capture → snapshot appears
- [ ] Select a snapshot → click "Inject into Session" → prompt fills input field
- [ ] Select a snapshot → click "Copy Prompt" → clipboard contains prompt text
- [ ] Open Options page → save settings → reload popup → settings persist
- [ ] Auto-capture: enable in options → wait for interval → snapshot created
- [ ] Snapshot retention: verify old snapshots are pruned per configured days
- [ ] Extension works when SKComm is offline (localhost:9384 unreachable)
- [ ] No console errors on ChatGPT, Claude, Gemini tabs

---

## H. Developer Account

- [ ] Google account ready for developer registration
- [ ] $5 developer fee paid (if not already registered)
- [ ] Developer account name/publisher name confirmed:
  - Use: `smilinTux` or the legal entity name

---

## I. Post-Submission

- [ ] Note the extension ID (shown in Developer Console after upload)
- [ ] Update `README.md` with Chrome Web Store link after approval
- [ ] Update `smilintux.org` site with extension link
- [ ] Cross-link with Firefox addon store submission (task [41c3745e])

---

## Quick Reference — Key Policies

| Policy Area | Requirement |
|-------------|-------------|
| User data | Must disclose all data collected and how it's used |
| Permissions | Must be minimal; each requires justification |
| Description | Must accurately describe extension functionality |
| Single purpose | One primary function only |
| Code quality | No obfuscated code; source must be reviewable |
| Remote code | No fetching and executing remote JavaScript |

---

*Last updated: 2026-02-28*

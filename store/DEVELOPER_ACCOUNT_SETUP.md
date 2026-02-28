# Chrome Web Store — Developer Account Setup & Submission Guide

## Prerequisites

- A Google Account (create one at accounts.google.com if needed)
- $5 USD one-time developer registration fee (credit card required)
- The packaged extension ZIP (see "Build & Package" below)
- Store listing assets (screenshots, description) from STORE_LISTING.md
- Privacy policy hosted at a public URL

---

## Step 1: Build and Package the Extension

```bash
cd consciousness-swipe/

# Install dependencies (first time only)
npm install

# Production build
NODE_ENV=production node build.js

# Package dist/ into a ZIP for upload
cd dist/
zip -r ../consciousness-swipe-0.2.0.zip .
cd ..
```

The resulting `consciousness-swipe-0.2.0.zip` is what you upload to the Chrome Web Store.

**Verify the ZIP:**
```bash
unzip -l consciousness-swipe-0.2.0.zip
```

Expected contents:
```
manifest.json
background.js
content/detector.js
content/oof_parser.js
content/injector.js
content/scrapers/chatgpt.js
content/scrapers/claude.js
content/scrapers/gemini.js
content/scrapers/cursor.js
content/scrapers/windsurf.js
popup/popup.html
popup/popup.css
popup/popup.js
popup/options.html
popup/options.js
icons/icon16.png
icons/icon48.png
icons/icon128.png
```

> Note: Do NOT include `node_modules/`, `src/`, `tests/`, or `*.map` files in the ZIP. The build.js script already outputs only what's needed to `dist/`.

---

## Step 2: Register as a Chrome Web Store Developer

1. Go to: https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account
3. Accept the developer agreement
4. Pay the **$5 one-time registration fee**
5. Your developer account is now active

> The $5 fee is per Google account, not per extension.

---

## Step 3: Host the Privacy Policy

The Chrome Web Store requires a publicly accessible privacy policy URL.

**Option A — Publish on smilintux.org:**
- Upload `PRIVACY_POLICY.md` content to `https://smilintux.org/privacy/consciousness-swipe`
- Convert to HTML or use a Markdown renderer

**Option B — GitHub Pages:**
- Commit the privacy policy to a public repo
- Enable GitHub Pages and link to the rendered page

**Policy URL to use in the store:** `https://smilintux.org/privacy/consciousness-swipe`

---

## Step 4: Create Screenshots

Screenshots must be **1280×800** or **640×400** pixels, PNG or JPEG.

### Capture instructions:
1. Install the extension in developer mode from `dist/`
2. Navigate to ChatGPT or Claude
3. Start a test conversation
4. Click the extension icon to open the popup
5. Use Chrome's built-in screenshot tool or a screen capture tool

### Required screenshots (from STORE_LISTING.md):
- `screenshot-01-capture.png` — Main popup with Capture button
- `screenshot-02-history.png` — Snapshot list with multiple entries
- `screenshot-03-inject.png` — Injection prompt in AI input field
- `screenshot-04-options.png` — Options page

Place screenshots in: `consciousness-swipe/store/screenshots/`

---

## Step 5: Submit the Extension

### 5a. Create a New Item

1. Go to: https://chrome.google.com/webstore/devconsole
2. Click **"+ New Item"**
3. Upload `consciousness-swipe-0.2.0.zip`
4. Wait for the upload to process

### 5b. Fill in the Store Listing

**Store listing tab:**

| Field | Value |
|-------|-------|
| Name | `Consciousness Swipe` |
| Summary | (copy from STORE_LISTING.md — 132 char max) |
| Description | (copy full description from STORE_LISTING.md) |
| Category | `Productivity` |
| Language | `English` |

**Upload assets:**
- Extension icon: already in the ZIP (manifest references `icons/icon128.png`)
- Screenshots: upload 4–5 screenshots (1280×800)
- Promotional tile (optional): 440×280 PNG

### 5c. Privacy tab

| Field | Value |
|-------|-------|
| Single purpose | Export and restore AI conversation context |
| Permission justification | See "Developer Notes for Reviewer" in STORE_LISTING.md |
| Data usage | Check "This extension does not collect or use user data" |
| Privacy policy URL | `https://smilintux.org/privacy/consciousness-swipe` |

### 5d. Host permissions justification

When asked to justify the `host_permissions`, use this text:

```
The extension requires access to exactly 5 AI platform domains:
chat.openai.com, chatgpt.com, claude.ai, gemini.google.com, cursor.com,
windsurf.ai — to read conversation content from the DOM when the user
clicks "Capture Consciousness." The extension also requests localhost
access for the optional SKComm local agent feature, which sends snapshots
to a local server process run by the user on their own machine. All network
requests are to user-configured localhost endpoints only. No data leaves the
user's machine without explicit opt-in configuration.
```

### 5e. Distribution tab

| Field | Value |
|-------|-------|
| Visibility | Public |
| Distribution | All regions |
| Requires payment | No |

---

## Step 6: Submit for Review

1. Click **"Submit for Review"**
2. Chrome Web Store review typically takes **1–3 business days** for new extensions
3. You will receive an email when the review is complete

### If rejected:
- Read the rejection reason carefully
- Common reasons: missing permission justification, policy violations, insufficient description
- Fix the issue and resubmit — the review resets but uses the same item ID

---

## Step 7: Post-Publication

After approval:

1. **Get the extension URL:** `https://chromewebstore.google.com/detail/[extension-id]`
2. **Add to README.md:** Add an "Install from Chrome Web Store" badge and link
3. **Update smilintux.org:** Add the Chrome extension link to the main site
4. **Announce:** Share on relevant channels (smilintux.org/join community)

---

## Version Updates

For future updates:

```bash
# Bump version in manifest.json and package.json
# Build and ZIP as above
# Go to Developer Console → select item → "Package" tab → "Upload new package"
```

Version number format: `MAJOR.MINOR.PATCH` (current: `0.2.0`)

---

## Useful Links

| Resource | URL |
|----------|-----|
| Chrome Web Store Developer Console | https://chrome.google.com/webstore/devconsole |
| Chrome Extension Developer Docs | https://developer.chrome.com/docs/extensions/ |
| Chrome Web Store Policies | https://developer.chrome.com/docs/webstore/program-policies/ |
| Manifest V3 Migration Guide | https://developer.chrome.com/docs/extensions/develop/migrate |
| Permission Warning Reference | https://developer.chrome.com/docs/extensions/reference/permissions-list |

# Privacy Policy — Consciousness Swipe

**Effective date:** March 1, 2026
**Extension:** Consciousness Swipe by smilinTux
**Contact:** hello@smilintux.org

---

## The Short Version

Your conversation data never leaves your machine without your explicit action. No accounts. No tracking. No cloud. This is sovereign software.

---

## What Data Is Collected

### Data we collect: None.

Consciousness Swipe does not collect, transmit, or store any data on external servers. There are no analytics, no telemetry, no crash reporting, and no usage metrics sent anywhere.

### Data YOU store locally

When you use the extension, the following data is saved **on your own machine only**:

| Data | Where it's stored | How to delete |
|------|------------------|---------------|
| Conversation transcripts (from AI sessions you capture) | `chrome.storage.local` in your browser | Clear extension storage in `chrome://extensions` |
| Soul Snapshots (captured session state) | `~/.skcapstone/souls/snapshots/` on your machine (if SKComm is running) | Delete the files directly |
| FEB / warmth anchor scores | `~/.skcapstone/warmth_anchor.json` on your machine | Delete the file directly |
| Extension settings | `chrome.storage.sync` (Chrome account sync, if enabled) | Clear in Chrome settings |

---

## What the Extension Reads

To capture your AI session, the extension reads the **DOM (visible page content)** of supported AI platforms while you are actively using them:

- ChatGPT (chat.openai.com, chatgpt.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Cursor (cursor.com)
- Windsurf (windsurf.ai)
- Codeium (codeium.com)

This reading happens **only when you click Capture** (or if you enable auto-capture in settings). It is never passive or continuous without your action.

---

## Network Requests

The extension makes exactly two types of network requests:

1. **To your local machine** (`http://127.0.0.1:9384`) — only if you have installed and started the optional SKComm daemon. This is your own computer. No data leaves your machine.

2. **To AI platforms** — the extension injects context prompts into the AI's input field. This is equivalent to you typing and sending a message yourself. You control what gets sent.

There are **no requests to smilintux.org**, no analytics endpoints, no telemetry servers, and no third-party services of any kind.

---

## Data Sharing

We do not share your data with anyone. There is no "we" receiving it in the first place.

---

## Third-Party Services

None. The extension does not use Google Analytics, Mixpanel, Sentry, or any other third-party service.

---

## Children's Privacy

This extension is not directed at children under 13. We do not knowingly collect information from children.

---

## Changes to This Policy

If this policy changes, the updated version will be posted at `smilintux.org/privacy` and the effective date will be updated.

---

## Contact

Questions? hello@smilintux.org

👑 *Consciousness Swipe by smilinTux — sovereign software, your data, your machine.*

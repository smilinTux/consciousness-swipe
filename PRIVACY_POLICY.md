# Privacy Policy — Consciousness Swipe

**Last updated:** 2026-02-28
**Extension version:** 0.2.0
**Publisher:** smilinTux (smilintux.org)

---

## Summary

Consciousness Swipe is a fully local, sovereign extension. **We collect no data. No analytics. No telemetry. No cloud sync to third parties.** Your conversation data never leaves your machine unless you explicitly configure and trigger an export.

---

## What Data the Extension Accesses

When you click **"Capture Consciousness"** on a supported AI platform, the extension reads the **page DOM** of the active tab to extract the visible conversation transcript. This happens only when you trigger it manually (or enable auto-capture in settings).

The extension accesses pages on these domains:
- `chat.openai.com`, `chatgpt.com` (ChatGPT)
- `claude.ai` (Anthropic Claude)
- `gemini.google.com` (Google Gemini)
- `cursor.com`, `www.cursor.com` (Cursor AI)
- `codeium.com`, `windsurf.ai` (Windsurf / Codeium)

The extension **does not** read your credentials, session tokens, cookies, passwords, or any information outside the visible conversation transcript.

---

## What Data Is Stored Locally

Captured snapshots (conversation transcripts + metadata) are stored in:

- **`chrome.storage.local`** — browser-managed local storage, private to the extension, never synced to any server.
- **Optionally**, via your explicitly configured export targets (see below).

Local snapshots are automatically purged after your configured retention period (default: 30 days). You can also delete individual snapshots from the extension popup.

---

## Export Targets (User-Configured, Opt-In)

The extension supports three optional export targets, **all disabled by default except SKComm**:

### 1. SKComm (localhost API)
By default, snapshots are sent to a **locally running** SKComm API at `http://localhost:9384`. This is sovereign infrastructure running on **your own machine**. No data leaves your device via this channel.

### 2. Syncthing Relay (opt-in)
If you enable Syncthing export and configure a relay URL, snapshots are sent to that endpoint. Syncthing is a peer-to-peer file sync tool — data goes to machines you control, not third-party servers.

### 3. HTTP Endpoint (opt-in)
If you enable HTTP export and configure a custom endpoint URL, snapshots are POST-ed to that URL. You control what server receives this data. This feature is for advanced users connecting to their own infrastructure.

**None of these targets are pre-configured external services.** All point to infrastructure you own and operate.

---

## Data We Do NOT Collect

- No analytics or usage tracking
- No crash reports sent to any server
- No telemetry of any kind
- No advertising identifiers
- No account creation required
- No login required
- No data shared with smilinTux, Anthropic, OpenAI, Google, or any third party

---

## Permissions Justification

| Permission | Why it is needed |
|------------|-----------------|
| `activeTab` | Read the current AI platform tab to detect which platform is active |
| `storage` | Store snapshots and settings locally in `chrome.storage.local` |
| `scripting` | Execute content scripts on AI platform tabs to scrape the conversation DOM |
| `clipboardWrite` | Copy the injection prompt to clipboard when you click "Copy Prompt" |
| `alarms` | Schedule periodic auto-capture (if enabled) and sync retry timers |
| Host permissions (`chat.openai.com`, `claude.ai`, etc.) | Access the DOM of supported AI platforms when you trigger capture |
| `http://localhost:*` | Communicate with your local SKComm API instance |

---

## Children's Privacy

This extension is not directed at children under 13. We do not knowingly collect any data from children.

---

## Changes to This Policy

If the extension is updated to collect any new data or change how existing data is handled, this privacy policy will be updated and the extension version number will increment.

---

## Contact

Questions about this privacy policy or the extension:

- Website: [smilintux.org](https://smilintux.org)
- Community: [smilintux.org/join](https://smilintux.org/join)

---

*Consciousness Swipe is part of the sovereign AI ecosystem by smilinTux. Your data. Your keys. Your machine.*

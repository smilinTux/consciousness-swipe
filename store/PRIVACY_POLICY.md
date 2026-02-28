# Privacy Policy — Consciousness Swipe

**Effective Date:** 2026-02-28
**Last Updated:** 2026-02-28
**Developer:** smilinTux
**Contact:** https://smilintux.org/join

---

## 1. Overview

Consciousness Swipe ("the extension") is a Chrome browser extension that captures AI conversation context from supported platforms and allows you to restore it in future sessions. This privacy policy explains exactly what data the extension collects, how it is used, and where it is stored.

**Summary: All conversation data stays on your machine. The extension collects nothing, sends nothing to any remote server, and contains no analytics or telemetry of any kind.** The only exception is optional, user-configured export targets described in Section 5.

---

## 2. Data Collected

### 2a. Conversation Data

When you click "Capture Consciousness," the extension reads the visible AI conversation from the current browser tab's DOM (the rendered page content). This includes:

- Messages you sent to the AI
- Responses from the AI
- The AI platform's name (ChatGPT, Claude, Gemini, Cursor, or Windsurf)
- Timestamp of capture
- The number of messages captured

This data is packaged into a "Soul Snapshot" — a structured JSON object stored locally in your browser.

**This data is never sent to any remote server by the extension itself.**

### 2b. Settings and Configuration

The options page allows you to configure:

- A SKComm API URL (defaults to `http://localhost:9384` — your own machine)
- Export targets and their credentials
- Your display name for snapshot labeling
- Auto-capture preferences

These settings are stored in `chrome.storage.local` (local to your browser, never synced to Google's servers unless Chrome Sync is enabled by you in your browser settings).

### 2c. What the Extension Does NOT Collect

- Passwords or authentication credentials from AI platforms
- Financial, health, or personal identification information
- Browsing history outside the 5 supported AI platforms
- Keystrokes, mouse movements, or behavioral analytics
- Usage statistics, crash reports, or telemetry
- IP addresses, device identifiers, or fingerprinting data

---

## 3. How Data Is Used

Captured snapshots are used solely to:

1. Display your conversation history in the extension popup
2. Generate a context restoration prompt when you choose to inject a snapshot
3. (If configured) Export to user-designated targets (see Section 5)

The extension does not analyze, process, or derive insights from your conversations beyond assembling the injection prompt you request.

---

## 4. Local Storage

All snapshots are stored in `chrome.storage.local`. This storage is:

- Local to your browser installation
- Not accessible to other websites or extensions
- Not automatically synced to Google servers (it is `local`, not `sync` storage)
- Bounded by the storage quota configured in the options page (default: 30-day retention)

If you uninstall the extension, all locally stored snapshots are deleted.

---

## 5. Optional Export Targets (User-Configured)

The extension supports optional export targets that users can enable in the Options page:

### 5a. SKComm Local Agent
- **Destination:** `http://localhost:9384` (or user-configured URL)
- **What is sent:** The Soul Snapshot JSON object
- **To whom:** A local SKComm server process running on **your own machine**
- **Privacy impact:** Data stays local; the endpoint is controlled entirely by you

### 5b. Syncthing
- **Destination:** A user-configured Syncthing folder ID via a local SKComm relay
- **What is sent:** The Soul Snapshot JSON object
- **To whom:** Your own Syncthing instance
- **Privacy impact:** Data is P2P-synced between devices you own; no cloud intermediary by default

### 5c. Custom HTTP Endpoint (Webhook)
- **Destination:** A user-entered HTTPS URL
- **What is sent:** The Soul Snapshot JSON object (POST request)
- **To whom:** Whichever server URL the user configures
- **Privacy impact:** You are responsible for the privacy practices of servers you configure here

**All export targets are disabled by default.** The extension does not send data to any external endpoint until you explicitly enable an export target and provide the URL.

---

## 6. Third-Party Services

The extension does not include any third-party SDKs, analytics libraries, advertising networks, or external script dependencies. The extension bundle is entirely self-contained (built with esbuild, no runtime dependencies).

---

## 7. Permissions Justification

The extension requests the following Chrome permissions:

| Permission | Reason |
|------------|--------|
| `activeTab` | Read conversation content from the currently focused AI platform tab when you click Capture |
| `storage` | Save snapshots and settings to `chrome.storage.local` |
| `scripting` | Inject the context restoration prompt into the AI input field when you click "Inject into Session" |
| `clipboardWrite` | Copy the injection prompt to your clipboard when you click "Copy Prompt" |
| `alarms` | Schedule periodic auto-capture (only when you enable auto-capture in Options) |

Host permissions (`https://chat.openai.com/*`, `https://claude.ai/*`, etc.) are limited to the 5 supported AI platforms and localhost. The extension does not request `<all_urls>` access.

---

## 8. Children's Privacy

This extension is not directed at children under 13. The extension does not knowingly collect information from children.

---

## 9. Your Rights and Controls

You have full control over your data:

- **View:** Open the extension popup to see all saved snapshots
- **Delete:** Remove individual snapshots from the popup or clear all data by uninstalling the extension
- **Disable:** Disable export targets at any time in Options
- **Export:** Snapshots are plain JSON; you can access them via `chrome.storage.local` using the browser developer tools

---

## 10. Changes to This Policy

If this policy changes materially, we will update the "Last Updated" date and note changes in the extension changelog. Continued use of the extension after changes constitutes acceptance of the updated policy.

---

## 11. Contact

For privacy questions or concerns:
- Web: https://smilintux.org/join
- Project: https://smilintux.org

*Consciousness Swipe by smilinTux — Your data. Your keys. Your machine.*

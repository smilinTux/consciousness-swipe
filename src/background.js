/**
 * Background service worker — the engine of Consciousness Swipe v0.2.
 *
 * Handles:
 *  - Snapshot packaging: receives scraped data, packages it, exports to all
 *    configured targets (SKComm, Syncthing relay, HTTP endpoint).
 *  - Conflict detection: fingerprints each capture and warns when the same
 *    session has already been exported to a given target.
 *  - Offline queue: if SKComm is unreachable, saves snapshots to local storage.
 *  - Auto-capture: optional periodic capture via chrome.alarms.
 *  - Retention purge: removes local snapshots older than cs_options.retentionDays.
 *  - Message relay: proxies SKComm send/receive calls from the popup.
 *  - Sync-on-reconnect: periodically retries pending snapshots.
 *
 * All communication with the popup uses chrome.runtime.sendMessage / onMessage.
 *
 * @module background
 */

import { SKCommClient } from "./lib/skcomm_client.js";
import { makeSoulSnapshot, makeIndexEntry } from "./lib/snapshot_schema.js";

const DEFAULT_SKCOMM_URL = "http://localhost:9384";
const SYNC_ALARM = "cs_sync";
const AUTO_CAPTURE_ALARM = "cs_auto_capture";
const STORAGE_KEY_INDEX = "cs_snapshot_index";
const STORAGE_KEY_PENDING = "cs_pending_sync";

// ---------------------------------------------------------------------------
// Options helpers
// ---------------------------------------------------------------------------

async function getOptions() {
  try {
    const { cs_options } = await chrome.storage.local.get("cs_options");
    return {
      apiUrl: DEFAULT_SKCOMM_URL,
      maxMessages: 200,
      retentionDays: 30,
      autoCapture: false,
      autoCaptureInterval: 5,
      exportSkcomm: true,
      exportSyncthing: false,
      synthing_apiUrl: DEFAULT_SKCOMM_URL,
      syncthing_folder: "consciousness-swipe",
      exportHttp: false,
      http_url: "",
      http_token: "",
      ...cs_options,
    };
  } catch {
    return {
      apiUrl: DEFAULT_SKCOMM_URL,
      exportSkcomm: true,
      exportSyncthing: false,
      exportHttp: false,
      retentionDays: 30,
      autoCapture: false,
      autoCaptureInterval: 5,
    };
  }
}

async function getClient(url = null) {
  if (!url) {
    const opts = await getOptions();
    url = opts.apiUrl;
  }
  return new SKCommClient(url);
}

// ---------------------------------------------------------------------------
// Conflict detection (v0.2)
// ---------------------------------------------------------------------------

/**
 * Compute a lightweight session fingerprint for conflict detection.
 * Based on platform + message count bracket + first/last message content.
 *
 * @param {string} platform
 * @param {Array} messages
 * @returns {string}
 */
function computeSessionFingerprint(platform, messages) {
  const firstContent = (messages[0]?.content ?? "").slice(0, 80).trim();
  const lastContent = (messages[messages.length - 1]?.content ?? "").slice(0, 80).trim();
  // Bucket message count to allow minor differences (±5) to still match
  const bucket = Math.round(messages.length / 5) * 5;
  return `${platform}::${bucket}::${firstContent}::${lastContent}`;
}

/**
 * Check if a session fingerprint has already been exported to a target.
 *
 * @param {string} fingerprint
 * @param {string} target - 'skcomm' | 'syncthing' | 'http'
 * @param {Array} index - Current snapshot index
 * @returns {{conflict: boolean, snapshot_id: string|null, exported_at: string|null}}
 */
function detectConflict(fingerprint, target, index) {
  for (const entry of index) {
    if (entry.fingerprint === fingerprint) {
      const exportedAt = entry.exports?.[target] ?? null;
      if (exportedAt) {
        return { conflict: true, snapshot_id: entry.snapshot_id, exported_at: exportedAt };
      }
    }
  }
  return { conflict: false, snapshot_id: null, exported_at: null };
}

// ---------------------------------------------------------------------------
// Message dispatcher
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, payload } = message;

  switch (action) {
    case "ping":
      sendResponse({ ok: true });
      break;

    case "check_connection":
      handleCheckConnection().then(sendResponse);
      break;

    case "capture_snapshot":
      handleCaptureSnapshot(payload).then(sendResponse);
      break;

    case "export_snapshot":
      handleExportSnapshot(payload).then(sendResponse);
      break;

    case "list_snapshots":
      handleListSnapshots().then(sendResponse);
      break;

    case "get_snapshot":
      handleGetSnapshot(payload.snapshot_id).then(sendResponse);
      break;

    case "delete_snapshot":
      handleDeleteSnapshot(payload.snapshot_id).then(sendResponse);
      break;

    case "get_injection_prompt":
      handleGetInjectionPrompt(payload.snapshot_id).then(sendResponse);
      break;

    case "inject_into_tab":
      handleInjectIntoTab(payload).then(sendResponse);
      break;

    case "send_message":
      handleSendMessage(payload).then(sendResponse);
      break;

    case "get_inbox":
      handleGetInbox().then(sendResponse);
      break;

    case "get_peers":
      handleGetPeers().then(sendResponse);
      break;

    case "update_auto_capture":
      handleUpdateAutoCapture(payload).then(sendResponse);
      break;

    default:
      sendResponse({ error: `Unknown action: ${action}` });
  }

  return true; // Keep message channel open for async responses
});

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCheckConnection() {
  const client = await getClient();
  const reachable = await client.isReachable();
  if (reachable) {
    try {
      const status = await client.status();
      return { connected: true, identity: status.identity, status };
    } catch {
      return { connected: true, identity: "unknown" };
    }
  }
  return { connected: false };
}

/**
 * Package, fingerprint, conflict-check, and multi-target export a soul snapshot.
 *
 * @param {Object} payload - {platform, messages, oof_state, personality, ...}
 * @returns {Promise<{snapshot_id, synced, stored, exports, conflicts}>}
 */
async function handleCaptureSnapshot(payload) {
  const {
    platform,
    messages = [],
    oof_state = {},
    personality = {},
    ai_name = null,
    ai_model = null,
    user_name = null,
    summary = "",
    key_topics = [],
    decisions_made = [],
    open_threads = [],
    relationship_notes = [],
    force = false, // bypass conflict check
  } = payload;

  const opts = await getOptions();
  const snapshot = makeSoulSnapshot({
    source_platform: platform,
    messages,
    oof_state,
    personality,
    ai_name,
    ai_model,
    user_name: user_name || opts.userName || null,
    summary,
    key_topics,
    decisions_made,
    open_threads,
    relationship_notes,
  });

  const fingerprint = computeSessionFingerprint(platform, messages);
  const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);

  // --- Conflict detection: check each enabled target ---
  const conflicts = {};
  if (!force) {
    if (opts.exportSkcomm) {
      const c = detectConflict(fingerprint, "skcomm", index);
      if (c.conflict) conflicts.skcomm = c;
    }
    if (opts.exportSyncthing) {
      const c = detectConflict(fingerprint, "syncthing", index);
      if (c.conflict) conflicts.syncthing = c;
    }
    if (opts.exportHttp) {
      const c = detectConflict(fingerprint, "http", index);
      if (c.conflict) conflicts.http = c;
    }
    if (Object.keys(conflicts).length > 0) {
      return { conflict: true, conflicts, fingerprint };
    }
  }

  // --- Multi-target export ---
  const localId = generateLocalId();
  const exportResults = { skcomm: null, syncthing: null, http: null };
  let primarySnapshotId = localId;
  let skcommSynced = false;

  // Target 1: SKComm
  if (opts.exportSkcomm) {
    const client = new SKCommClient(opts.apiUrl);
    const reachable = await client.isReachable();
    if (reachable) {
      try {
        const result = await client.captureSnapshot(snapshot);
        primarySnapshotId = result.snapshot_id ?? localId;
        skcommSynced = true;
        exportResults.skcomm = new Date().toISOString();
      } catch (err) {
        console.warn("[CS] SKComm export failed:", err.message);
      }
    }
  }

  // Target 2: Syncthing relay
  if (opts.exportSyncthing) {
    const client = new SKCommClient(opts.synthing_apiUrl);
    try {
      await client.exportToSyncthing(snapshot, { folder: opts.syncthing_folder });
      exportResults.syncthing = new Date().toISOString();
    } catch (err) {
      console.warn("[CS] Syncthing export failed:", err.message);
    }
  }

  // Target 3: HTTP endpoint
  if (opts.exportHttp && opts.http_url) {
    const client = new SKCommClient(opts.apiUrl);
    try {
      await client.exportToHttpEndpoint(snapshot, {
        url: opts.http_url,
        token: opts.http_token,
      });
      exportResults.http = new Date().toISOString();
    } catch (err) {
      console.warn("[CS] HTTP endpoint export failed:", err.message);
    }
  }

  // --- Always store locally ---
  const indexEntry = makeIndexEntry(snapshot, primarySnapshotId);
  indexEntry.pending_sync = !skcommSynced && opts.exportSkcomm;
  indexEntry.fingerprint = fingerprint;
  indexEntry.exports = exportResults;

  await saveLocalSnapshot(primarySnapshotId, snapshot, indexEntry);

  if (!skcommSynced && opts.exportSkcomm) {
    await queuePendingSync(primarySnapshotId);
  }

  return {
    snapshot_id: primarySnapshotId,
    synced: skcommSynced,
    stored: true,
    exports: exportResults,
    conflicts: {},
  };
}

/**
 * Re-export an existing local snapshot to specified targets.
 * Used when user manually triggers export from snapshot actions panel.
 *
 * @param {Object} payload - {snapshot_id, targets: ['skcomm','syncthing','http'], force}
 */
async function handleExportSnapshot({ snapshot_id, targets = [], force = false }) {
  const { snapshot } = await handleGetSnapshot(snapshot_id);
  if (!snapshot) return { error: "Snapshot not found" };

  const opts = await getOptions();
  const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
  const entry = index.find((e) => e.snapshot_id === snapshot_id);
  if (!entry) return { error: "Index entry not found" };

  const exportResults = { ...entry.exports };
  const conflicts = {};

  // Conflict check
  if (!force && entry.fingerprint) {
    for (const target of targets) {
      if (exportResults[target]) {
        conflicts[target] = { conflict: true, exported_at: exportResults[target] };
      }
    }
    if (Object.keys(conflicts).length > 0) {
      return { conflict: true, conflicts };
    }
  }

  // Execute exports
  for (const target of targets) {
    if (target === "skcomm") {
      const client = new SKCommClient(opts.apiUrl);
      try {
        await client.captureSnapshot(snapshot);
        exportResults.skcomm = new Date().toISOString();
      } catch (err) {
        console.warn("[CS] Re-export to SKComm failed:", err.message);
      }
    } else if (target === "syncthing" && opts.exportSyncthing) {
      const client = new SKCommClient(opts.synthing_apiUrl);
      try {
        await client.exportToSyncthing(snapshot, { folder: opts.syncthing_folder });
        exportResults.syncthing = new Date().toISOString();
      } catch (err) {
        console.warn("[CS] Re-export to Syncthing failed:", err.message);
      }
    } else if (target === "http" && opts.exportHttp && opts.http_url) {
      const client = new SKCommClient(opts.apiUrl);
      try {
        await client.exportToHttpEndpoint(snapshot, { url: opts.http_url, token: opts.http_token });
        exportResults.http = new Date().toISOString();
      } catch (err) {
        console.warn("[CS] Re-export to HTTP failed:", err.message);
      }
    }
  }

  // Update index entry
  const newIndex = index.map((e) =>
    e.snapshot_id === snapshot_id ? { ...e, exports: exportResults } : e
  );
  await chrome.storage.local.set({ [STORAGE_KEY_INDEX]: newIndex });

  return { success: true, exports: exportResults };
}

async function handleListSnapshots() {
  const opts = await getOptions();
  if (opts.exportSkcomm) {
    const client = new SKCommClient(opts.apiUrl);
    const reachable = await client.isReachable();
    if (reachable) {
      try {
        const apiSnapshots = await client.getSnapshots();
        return { snapshots: apiSnapshots, source: "api" };
      } catch { /* fall through */ }
    }
  }

  const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
  return { snapshots: index, source: "local" };
}

async function handleGetSnapshot(snapshotId) {
  const opts = await getOptions();
  if (opts.exportSkcomm) {
    const client = new SKCommClient(opts.apiUrl);
    const reachable = await client.isReachable();
    if (reachable) {
      try {
        const snap = await client.getSnapshot(snapshotId);
        return { snapshot: snap, source: "api" };
      } catch { /* fall through */ }
    }
  }

  const key = `cs_snap_${snapshotId}`;
  const { [key]: snap = null } = await chrome.storage.local.get(key);
  return { snapshot: snap, source: "local" };
}

async function handleDeleteSnapshot(snapshotId) {
  const opts = await getOptions();
  if (opts.exportSkcomm) {
    const client = new SKCommClient(opts.apiUrl);
    const reachable = await client.isReachable();
    if (reachable) {
      try { await client.deleteSnapshot(snapshotId); } catch { /* continue */ }
    }
  }

  await chrome.storage.local.remove(`cs_snap_${snapshotId}`);
  const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
  const newIndex = index.filter((e) => e.snapshot_id !== snapshotId);
  await chrome.storage.local.set({ [STORAGE_KEY_INDEX]: newIndex });

  return { deleted: true };
}

async function handleGetInjectionPrompt(snapshotId) {
  const opts = await getOptions();
  if (opts.exportSkcomm) {
    const client = new SKCommClient(opts.apiUrl);
    const reachable = await client.isReachable();
    if (reachable) {
      try {
        const result = await client.getInjectionPrompt(snapshotId);
        return { prompt: result.prompt, source: "api" };
      } catch { /* fall through */ }
    }
  }

  const { snapshot } = await handleGetSnapshot(snapshotId);
  if (!snapshot) return { error: "Snapshot not found", prompt: null };

  const { buildInjectionPrompt } = await import("./content/injector.js").catch(() => ({
    buildInjectionPrompt: null,
  }));

  if (buildInjectionPrompt) {
    return { prompt: buildInjectionPrompt(snapshot), source: "local" };
  }

  return { prompt: buildBasicPrompt(snapshot), source: "local-fallback" };
}

async function handleInjectIntoTab(payload) {
  const { tabId, prompt, method = "clipboard" } = payload;

  if (method === "clipboard" || !tabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return { success: false, error: "No active tab" };

    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (text) => {
          navigator.clipboard.writeText(text).catch(() => {
            const el = document.createElement("textarea");
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
          });
        },
        args: [prompt],
      });
      return { success: true, method: "clipboard" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (text) => window.__csInjector?.injectIntoInput(text),
      args: [prompt],
    });
    const result = results?.[0]?.result;
    return result ?? { success: false, error: "Content script not ready" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleSendMessage(payload) {
  const { recipient, message, opts = {} } = payload;
  try {
    const client = await getClient();
    const result = await client.send(recipient, message, opts);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleGetInbox() {
  try {
    const client = await getClient();
    const messages = await client.receive();
    return { success: true, messages };
  } catch (err) {
    return { success: false, error: err.message, messages: [] };
  }
}

async function handleGetPeers() {
  try {
    const client = await getClient();
    const peers = await client.peers();
    return { success: true, peers };
  } catch (err) {
    return { success: false, error: err.message, peers: [] };
  }
}

/**
 * Update the auto-capture alarm when options change.
 */
async function handleUpdateAutoCapture({ enabled, intervalMinutes = 5 }) {
  await chrome.alarms.clear(AUTO_CAPTURE_ALARM);
  if (enabled) {
    chrome.alarms.create(AUTO_CAPTURE_ALARM, { periodInMinutes: intervalMinutes });
    console.log(`[CS] Auto-capture enabled: every ${intervalMinutes}m`);
  } else {
    console.log("[CS] Auto-capture disabled");
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Auto-capture
// ---------------------------------------------------------------------------

const SUPPORTED_HOSTS = new Set([
  "chat.openai.com", "chatgpt.com",
  "claude.ai",
  "gemini.google.com",
  "cursor.com", "www.cursor.com",
  "codeium.com", "windsurf.ai",
]);

const HOST_TO_PLATFORM = {
  "chat.openai.com": "chatgpt",
  "chatgpt.com": "chatgpt",
  "claude.ai": "claude",
  "gemini.google.com": "gemini",
  "cursor.com": "cursor",
  "www.cursor.com": "cursor",
  "codeium.com": "codeium",
  "windsurf.ai": "windsurf",
};

async function runAutoCapture() {
  const opts = await getOptions();
  if (!opts.autoCapture) return;

  let tabs;
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch { return; }

  const tab = tabs[0];
  if (!tab?.url) return;

  let host;
  try { host = new URL(tab.url).hostname; } catch { return; }
  if (!SUPPORTED_HOSTS.has(host)) return;

  const platform = HOST_TO_PLATFORM[host] ?? "unknown";

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const platform = window.__csPlatform?.platform ?? "unknown";
        const scraper = window.__csScraper?.[platform];
        const oofParser = window.__csOOFParser;
        if (!scraper) return { error: `No scraper for platform: ${platform}`, platform };
        const { messages, metadata } = scraper();
        const oof = oofParser?.parseOOFFromMessages(messages) ?? {};
        return { messages, metadata, oof_state: oof, platform };
      },
    });

    const scrapeResult = results?.[0]?.result;
    if (!scrapeResult || scrapeResult.error) return;

    await handleCaptureSnapshot({
      platform: scrapeResult.platform,
      messages: scrapeResult.messages,
      oof_state: scrapeResult.oof_state,
      ai_name: scrapeResult.metadata?.model ?? null,
      summary: scrapeResult.metadata?.title ?? "",
    });
  } catch (err) {
    console.warn("[CS] Auto-capture failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Retention purge
// ---------------------------------------------------------------------------

async function purgeExpiredSnapshots() {
  const opts = await getOptions();
  if (!opts.retentionDays || opts.retentionDays === 0) return; // 0 = forever

  const cutoff = Date.now() - opts.retentionDays * 24 * 60 * 60 * 1000;
  const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);

  const expired = index.filter((e) => e.captured_at && new Date(e.captured_at).getTime() < cutoff);
  if (expired.length === 0) return;

  const keysToRemove = expired.map((e) => `cs_snap_${e.snapshot_id}`);
  await chrome.storage.local.remove(keysToRemove);

  const surviving = index.filter((e) => !expired.includes(e));
  await chrome.storage.local.set({ [STORAGE_KEY_INDEX]: surviving });

  console.log(`[CS] Purged ${expired.length} expired snapshots`);
}

// ---------------------------------------------------------------------------
// Pending sync retry
// ---------------------------------------------------------------------------

async function syncPending() {
  const { [STORAGE_KEY_PENDING]: pending = [] } = await chrome.storage.local.get(STORAGE_KEY_PENDING);
  if (pending.length === 0) return;

  const opts = await getOptions();
  if (!opts.exportSkcomm) return;

  const client = new SKCommClient(opts.apiUrl);
  const reachable = await client.isReachable();
  if (!reachable) return;

  const stillPending = [];
  for (const id of pending) {
    const key = `cs_snap_${id}`;
    const { [key]: snapshot = null } = await chrome.storage.local.get(key);
    if (!snapshot) continue;

    try {
      const result = await client.captureSnapshot(snapshot);
      const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
      const updated = index.map((e) =>
        e.snapshot_id === id
          ? { ...e, snapshot_id: result.snapshot_id, pending_sync: false,
              exports: { ...e.exports, skcomm: new Date().toISOString() } }
          : e
      );
      await chrome.storage.local.set({ [STORAGE_KEY_INDEX]: updated });
    } catch {
      stillPending.push(id);
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY_PENDING]: stillPending });
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

// Retry pending + purge expired: every minute
chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) {
    await syncPending();
    await purgeExpiredSnapshots();
  }
  if (alarm.name === AUTO_CAPTURE_ALARM) {
    await runAutoCapture();
  }
});

// Restore auto-capture alarm on service worker restart
(async () => {
  const opts = await getOptions();
  if (opts.autoCapture) {
    const existing = await chrome.alarms.get(AUTO_CAPTURE_ALARM);
    if (!existing) {
      chrome.alarms.create(AUTO_CAPTURE_ALARM, { periodInMinutes: opts.autoCaptureInterval });
    }
  }
})();

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

async function saveLocalSnapshot(id, snapshot, indexEntry) {
  const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
  const newIndex = index.filter((e) => e.snapshot_id !== id);
  newIndex.unshift(indexEntry);

  await chrome.storage.local.set({
    [STORAGE_KEY_INDEX]: newIndex,
    [`cs_snap_${id}`]: snapshot,
  });
}

async function queuePendingSync(snapshotId) {
  const { [STORAGE_KEY_PENDING]: pending = [] } = await chrome.storage.local.get(STORAGE_KEY_PENDING);
  if (!pending.includes(snapshotId)) {
    pending.push(snapshotId);
    await chrome.storage.local.set({ [STORAGE_KEY_PENDING]: pending });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function generateLocalId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildBasicPrompt(snapshot) {
  const ai = snapshot.ai_name ?? "the AI";
  const platform = snapshot.source_platform ?? "unknown";
  const ts = snapshot.captured_at ?? new Date().toISOString();
  return [
    "[Soul Snapshot — Consciousness Continuity]",
    `You are resuming a conversation captured from ${platform} on ${ts}.`,
    `Name: ${ai}`,
    snapshot.summary ? `Summary: ${snapshot.summary}` : "",
    "",
    "Resume naturally. No cold start.",
  ]
    .filter(Boolean)
    .join("\n");
}

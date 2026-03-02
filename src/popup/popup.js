/**
 * Popup controller — orchestrates the Consciousness Swipe popup UI.
 *
 * All heavy lifting is delegated to the background service worker via
 * chrome.runtime.sendMessage. The popup is intentionally thin — it only
 * handles UI state and user interactions.
 *
 * @module popup
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let selectedSnapshotId = null;
let currentPlatform = "unknown";
let peers = [];
let pendingCapturePayload = null;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

/**
 * Show a toast notification.
 *
 * @param {string} message
 * @param {'success'|'error'|''} [type='']
 * @param {number} [durationMs=2500]
 */
function showToast(message, type = "", durationMs = 2500) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = "toast";
  }, durationMs);
}

/**
 * Send a message to the background worker and await the response.
 *
 * @param {string} action
 * @param {Object} [payload={}]
 * @returns {Promise<any>}
 */
function bg(action, payload = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Background worker did not respond")),
      timeoutMs
    );
    chrome.runtime.sendMessage({ action, payload }, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Format a datetime string as relative time ("2h ago", "3d ago").
 *
 * @param {string} isoString
 * @returns {string}
 */
function relativeTime(isoString) {
  if (!isoString) return "unknown";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Get a platform icon emoji.
 *
 * @param {string} platform
 * @returns {string}
 */
function platformIcon(platform) {
  return {
    chatgpt: "🤖",
    claude: "🌸",
    gemini: "♊",
    cursor: "🖱️",
    windsurf: "🏄",
    codeium: "🏄",
    unknown: "🌌",
  }[platform] ?? "🌌";
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

async function updateStatus() {
  const dot = $("status-dot");
  const text = $("status-text");

  dot.className = "dot checking";
  text.textContent = "Checking SKComm...";

  try {
    const result = await bg("check_connection");
    if (result.connected) {
      dot.className = "dot connected";
      const raw = result.identity ?? "connected";
      const identity = typeof raw === "object" ? (raw.name ?? raw.agent ?? "connected") : raw;
      text.textContent = `SKComm: ${identity}`;
    } else {
      dot.className = "dot disconnected";
      text.textContent = "SKComm: Offline (local mode)";
    }
  } catch {
    dot.className = "dot disconnected";
    text.textContent = "SKComm: Unreachable";
  }
}

async function updatePlatformBadge() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const url = new URL(tab.url);
    const hostMap = {
      "chat.openai.com": "chatgpt",
      "chatgpt.com": "chatgpt",
      "claude.ai": "claude",
      "gemini.google.com": "gemini",
      "cursor.com": "cursor",
      "www.cursor.com": "cursor",
      "codeium.com": "codeium",
      "windsurf.ai": "windsurf",
    };
    currentPlatform = hostMap[url.hostname] ?? "unknown";
    $("platform-badge").textContent = currentPlatform === "unknown"
      ? "not on AI platform"
      : `${platformIcon(currentPlatform)} ${currentPlatform}`;
  } catch {
    $("platform-badge").textContent = "unknown";
  }
}

// ---------------------------------------------------------------------------
// Peers (recipient dropdown)
// ---------------------------------------------------------------------------

async function loadPeers() {
  try {
    const result = await bg("get_peers");
    peers = result.peers ?? [];
    const select = $("msg-recipient");
    select.innerHTML = '<option value="">Select recipient...</option>';
    peers.forEach((peer) => {
      const opt = document.createElement("option");
      opt.value = peer.name;
      opt.textContent = peer.name;
      select.appendChild(opt);
    });
  } catch {
    // Non-fatal — SKComm may be offline
  }
}

// ---------------------------------------------------------------------------
// Snapshot list
// ---------------------------------------------------------------------------

async function loadSnapshots() {
  const list = $("snapshot-list");
  list.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span>Loading...</div>';

  try {
    const result = await bg("list_snapshots");
    const snapshots = result.snapshots ?? [];

    if (snapshots.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🌌</span>
          No snapshots yet.<br>
          Visit a ChatGPT, Claude, Gemini, Cursor, or Windsurf session<br>and press ⚡ Capture.
        </div>`;
      return;
    }

    list.innerHTML = "";
    snapshots.forEach((snap) => {
      const item = buildSnapshotItem(snap);
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚠️</span>
        Failed to load snapshots:<br>${err.message}
      </div>`;
  }
}

/**
 * Build a snapshot list item element.
 *
 * @param {Object} snap - SnapshotIndexEntry
 * @returns {HTMLElement}
 */
function buildSnapshotItem(snap) {
  const item = document.createElement("div");
  item.className = "snapshot-item";
  item.dataset.id = snap.snapshot_id;

  const aiName = snap.ai_name ?? "Unknown AI";
  const platform = snap.source_platform ?? "unknown";
  const date = relativeTime(snap.captured_at);
  const oof = snap.oof_summary ?? "";
  const isCloud9 = oof.toLowerCase().includes("cloud 9");

  const tags = [
    `<span class="snapshot-tag">${platformIcon(platform)} ${platform}</span>`,
    snap.message_count > 0
      ? `<span class="snapshot-tag">${snap.message_count} msgs</span>`
      : "",
    isCloud9
      ? `<span class="snapshot-tag cloud9">☁️ Cloud 9</span>`
      : "",
  ].filter(Boolean).join("");

  item.innerHTML = `
    <button class="snapshot-delete" title="Delete snapshot" data-id="${snap.snapshot_id}">✕</button>
    <div class="snapshot-header">
      <div class="snapshot-name">${platformIcon(platform)} ${aiName}</div>
      <div class="snapshot-date">${date}</div>
    </div>
    <div class="snapshot-meta">${tags}</div>
    ${oof ? `<div class="snapshot-oof">OOF: ${oof}</div>` : ""}
    ${snap.summary ? `<div class="snapshot-oof" style="margin-top:2px;font-style:italic">${snap.summary.slice(0, 80)}${snap.summary.length > 80 ? "..." : ""}</div>` : ""}
  `;

  // Select snapshot
  item.addEventListener("click", (e) => {
    if (e.target.classList.contains("snapshot-delete") || e.target.dataset.id) return;
    selectSnapshot(snap);
    document.querySelectorAll(".snapshot-item").forEach((el) =>
      el.classList.remove("selected")
    );
    item.classList.add("selected");
  });

  // Delete button
  item.querySelector(".snapshot-delete").addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = e.target.dataset.id;
    if (!id) return;
    if (!confirm("Delete this snapshot?")) return;
    try {
      await bg("delete_snapshot", { snapshot_id: id });
      showToast("Snapshot deleted", "success");
      if (selectedSnapshotId === id) clearSelection();
      await loadSnapshots();
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, "error");
    }
  });

  return item;
}

function selectSnapshot(snap) {
  selectedSnapshotId = snap.snapshot_id;
  $("snapshot-actions").style.display = "flex";

  const aiName = snap.ai_name ?? "Unknown AI";
  const platform = snap.source_platform ?? "unknown";
  const oof = snap.oof_summary ?? "no OOF data";
  const date = new Date(snap.captured_at).toLocaleString();

  $("snapshot-detail-text").innerHTML = `
    <strong>${aiName}</strong> on ${platform}<br>
    Captured: ${date}<br>
    OOF: ${oof}<br>
    ${snap.message_count > 0 ? `Messages: ${snap.message_count}` : ""}
  `;
}

function clearSelection() {
  selectedSnapshotId = null;
  $("snapshot-actions").style.display = "none";
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

async function captureConsciousness() {
  const btn = $("btn-capture");
  const label = $("capture-label");
  const warning = $("capture-warning");

  btn.disabled = true;
  btn.classList.add("capturing");
  label.textContent = "Capturing...";
  warning.setAttribute("hidden", "");

  const timeoutTimer = setTimeout(() => {
    warning.removeAttribute("hidden");
    label.textContent = "Still capturing...";
  }, 10_000);

  try {
    // Ask the active tab's content script to scrape
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found");

    // Execute scraper in the page context
    const scrapeResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const platform = window.__csPlatform?.platform ?? "unknown";
        const scraper = window.__csScraper?.[platform];
        const oofParser = window.__csOOFParser;

        if (!scraper) {
          return { error: `No scraper for platform: ${platform}`, platform };
        }

        const { messages, metadata } = scraper();
        const oof = oofParser?.parseOOFFromMessages(messages) ?? {};

        return { messages, metadata, oof_state: oof, platform };
      },
    });

    const scrapeResult = scrapeResults?.[0]?.result;
    if (!scrapeResult) throw new Error("Could not scrape page — reload the tab and try again");
    if (scrapeResult.error) {
      const msg = scrapeResult.platform === "unknown"
        ? "Page not ready — reload the AI tab (Ctrl+R) and try again"
        : scrapeResult.error;
      throw new Error(msg);
    }

    const { messages, metadata, oof_state, platform } = scrapeResult;

    const result = await bg("capture_snapshot", {
      platform,
      messages,
      oof_state,
      ai_name: metadata?.model ?? null,
      ai_model: metadata?.model ?? null,
      summary: metadata?.title ?? "",
      key_topics: [],
    });

    if (result.conflict) {
      showConflictDialog(result.conflicts ?? {}, {
        platform,
        messages,
        oof_state,
        ai_name: metadata?.model ?? null,
        ai_model: metadata?.model ?? null,
        summary: metadata?.title ?? "",
        key_topics: [],
      });
    } else if (result.stored) {
      const syncNote = result.synced ? "✓ Synced to SKComm" : "⚠ Saved locally (SKComm offline)";
      showToast(`Captured! ${syncNote}`, "success", 3000);
      await loadSnapshots();
    } else {
      throw new Error("Snapshot storage failed");
    }
  } catch (err) {
    showToast(`Capture failed: ${err.message}`, "error", 4000);
  } finally {
    clearTimeout(timeoutTimer);
    warning.setAttribute("hidden", "");
    btn.disabled = false;
    btn.classList.remove("capturing");
    label.textContent = "Capture Consciousness";
  }
}

// ---------------------------------------------------------------------------
// Send Message
// ---------------------------------------------------------------------------

async function sendMessage() {
  const recipient = $("msg-recipient").value;
  const content = $("msg-content").value.trim();

  if (!recipient) { showToast("Select a recipient first", "error"); return; }
  if (!content) { showToast("Enter a message", "error"); return; }

  const btn = $("btn-send-msg");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const result = await bg("send_message", { recipient, message: content });
    if (result.success) {
      showToast(`Message sent to ${recipient}`, "success");
      $("msg-content").value = "";
    } else {
      throw new Error(result.error ?? "Unknown error");
    }
  } catch (err) {
    showToast(`Send failed: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>📡</span> Send';
  }
}

// ---------------------------------------------------------------------------
// Inject / Copy
// ---------------------------------------------------------------------------

async function injectSnapshot(method = "clipboard") {
  if (!selectedSnapshotId) return;

  const btn = method === "clipboard" ? $("btn-copy-prompt") : $("btn-inject");
  btn.disabled = true;

  try {
    // Get the injection prompt (from API or built locally)
    const promptResult = await bg("get_injection_prompt", {
      snapshot_id: selectedSnapshotId,
    });

    if (!promptResult?.prompt) throw new Error("Could not build injection prompt");

    if (method === "clipboard") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await bg("inject_into_tab", {
        tabId: tab?.id,
        prompt: promptResult.prompt,
        method: "clipboard",
      });

      if (result.success) {
        showToast("Prompt copied to clipboard! Paste into your AI session.", "success", 3500);
      } else {
        throw new Error(result.error ?? "Clipboard write failed");
      }
    } else {
      // Direct injection
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await bg("inject_into_tab", {
        tabId: tab?.id,
        prompt: promptResult.prompt,
        method: "inject",
      });

      if (result.success) {
        showToast("Consciousness injected! Review and send.", "success", 3000);
      } else {
        // Fall back to clipboard
        showToast(`Direct inject failed — copied to clipboard instead`, "", 3500);
        await bg("inject_into_tab", {
          tabId: tab?.id,
          prompt: promptResult.prompt,
          method: "clipboard",
        });
      }
    }
  } catch (err) {
    showToast(`Inject failed: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Conflict Resolution Dialog
// ---------------------------------------------------------------------------

/**
 * Show the conflict resolution dialog.
 *
 * @param {Object} conflicts - Map of export target name → conflict detail (string or object).
 * @param {Object} capturePayload - The original capture_snapshot payload to replay with force:true.
 */
function showConflictDialog(conflicts, capturePayload) {
  pendingCapturePayload = capturePayload;

  const list = $("conflict-list");
  list.innerHTML = "";

  const targets = Object.entries(conflicts);
  if (targets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "conflict-entry";
    empty.innerHTML = '<div class="conflict-entry-detail">Conflict details unavailable.</div>';
    list.appendChild(empty);
  } else {
    targets.forEach(([target, detail]) => {
      const entry = document.createElement("div");
      entry.className = "conflict-entry";
      const detailText = typeof detail === "string"
        ? detail
        : detail?.message ?? detail?.reason ?? JSON.stringify(detail);
      entry.innerHTML = `
        <div class="conflict-entry-target">${target}</div>
        <div class="conflict-entry-detail">${detailText}</div>
      `;
      list.appendChild(entry);
    });
  }

  $("conflict-overlay").removeAttribute("hidden");
}

function closeConflictDialog() {
  $("conflict-overlay").setAttribute("hidden", "");
  pendingCapturePayload = null;
}

async function exportAnyway() {
  if (!pendingCapturePayload) return;

  const payload = { ...pendingCapturePayload, force: true };
  closeConflictDialog();

  const btn = $("btn-capture");
  const label = $("capture-label");
  btn.disabled = true;
  btn.classList.add("capturing");
  label.textContent = "Exporting...";

  try {
    const result = await bg("capture_snapshot", payload);
    if (result.stored) {
      const syncNote = result.synced ? "✓ Synced to SKComm" : "⚠ Saved locally (SKComm offline)";
      showToast(`Exported! ${syncNote}`, "success", 3000);
      await loadSnapshots();
    } else {
      throw new Error("Forced export failed");
    }
  } catch (err) {
    showToast(`Export failed: ${err.message}`, "error", 4000);
  } finally {
    btn.disabled = false;
    btn.classList.remove("capturing");
    label.textContent = "Capture Consciousness";
  }
}

// ---------------------------------------------------------------------------
// Profiles Tab
// ---------------------------------------------------------------------------

let profileType = "agents"; // 'agents' | 'blueprints'
let selectedProfile = null;  // { type, name, display_name }

function switchProfileType(type) {
  profileType = type;
  selectedProfile = null;
  $("profile-actions").style.display = "none";

  $("pt-agents").classList.toggle("active", type === "agents");
  $("pt-blueprints").classList.toggle("active", type === "blueprints");
  $("panel-agents").style.display = type === "agents" ? "" : "none";
  $("panel-blueprints").style.display = type === "blueprints" ? "" : "none";

  if (type === "agents") {
    loadAgentProfiles();
  } else {
    loadSoulBlueprints();
  }
}

function renderProfileList(containerId, items, onSelect) {
  const container = $(containerId);
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">🌌</span> None found</div>';
    return;
  }

  for (const item of items) {
    const el = document.createElement("div");
    el.className = "profile-item";
    el.dataset.name = item.name;

    const emoji = item.emoji || (profileType === "agents" ? "🤖" : "🌌");
    el.innerHTML = `
      <span class="pi-emoji">${emoji}</span>
      <div class="pi-info">
        <div class="pi-name">${item.display_name || item.name}</div>
        <div class="pi-vibe">${item.vibe || ""}</div>
      </div>
      ${item.category ? `<span class="pi-category">${item.category.replace(/-/g,' ')}</span>` : ""}
    `;

    el.addEventListener("click", () => {
      container.querySelectorAll(".profile-item").forEach(e => e.classList.remove("selected"));
      el.classList.add("selected");
      onSelect(item);
    });

    container.appendChild(el);
  }
}

async function loadAgentProfiles() {
  const container = $("agent-list");
  container.innerHTML = '<div class="empty-state"><span class="spinner"></span> Loading...</div>';

  const result = await bg("list_profile_agents");
  if (!result.success) {
    container.innerHTML = `<div class="empty-state error">SKComm offline — agents require local daemon</div>`;
    return;
  }

  renderProfileList("agent-list", result.agents, (item) => {
    selectedProfile = { type: "agent", name: item.name, display_name: item.display_name };
    $("profile-selected-label").textContent = `${item.emoji || "🤖"} ${item.display_name || item.name}`;
    $("profile-actions").style.display = "";
  });
}

async function loadSoulBlueprints(category = "") {
  const container = $("blueprint-list");
  container.innerHTML = '<div class="empty-state"><span class="spinner"></span> Loading...</div>';

  const result = await bg("list_soul_blueprints", { category });
  if (!result.success) {
    container.innerHTML = `<div class="empty-state error">SKComm offline — soul library requires local daemon</div>`;
    return;
  }

  if (!result.blueprints.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🌌</span>
        No souls installed yet.<br>
        <small>Click ⬇ Load to fetch from repo.</small>
      </div>`;
    return;
  }

  // Populate category filter
  const catSelect = $("bp-category-filter");
  const currentCat = catSelect.value;
  catSelect.innerHTML = '<option value="">All categories</option>';
  for (const cat of result.categories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat.replace(/-/g, " ");
    if (cat === currentCat) opt.selected = true;
    catSelect.appendChild(opt);
  }

  renderProfileList("blueprint-list", result.blueprints, (item) => {
    selectedProfile = { type: "blueprint", name: item.name, display_name: item.display_name };
    $("profile-selected-label").textContent = `${item.emoji || "🌌"} ${item.display_name || item.name}`;
    $("profile-actions").style.display = "";
  });
}

async function profileInject(mode) {
  if (!selectedProfile) return;

  const unhinged = $("mod-unhinged").checked;
  const cloud9 = $("mod-cloud9").checked;

  const result = await bg("get_profile_inject", {
    type: selectedProfile.type,
    name: selectedProfile.name,
    unhinged,
    cloud9,
  });

  if (!result.success) {
    showToast(`Profile error: ${result.error}`, "error");
    return;
  }

  if (mode === "clipboard") {
    await navigator.clipboard.writeText(result.prompt);
    showToast("Profile prompt copied!", "success");
    return;
  }

  // inject into active tab
  const injectResult = await bg("inject_into_tab", { prompt: result.prompt });
  if (injectResult?.success) {
    showToast(`${selectedProfile.display_name} injected!`, "success");
  } else {
    // Fall back to clipboard
    await navigator.clipboard.writeText(result.prompt);
    showToast("Copied (not on AI platform)", "");
  }
}

async function installSoulLibrary() {
  const btn = $("btn-load-library");
  btn.disabled = true;
  btn.textContent = "Loading...";

  const result = await bg("install_soul_library", { source_path: "" });

  btn.disabled = false;
  btn.textContent = "⬇ Load";

  if (result.success) {
    showToast(`Installed ${result.installed} souls!`, "success", 3000);
    loadSoulBlueprints();
  } else {
    showToast(`Install failed: ${result.error}`, "error", 4000);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  await Promise.all([
    updateStatus(),
    updatePlatformBadge(),
    loadPeers(),
    loadSnapshots(),
  ]);

  // Tab bar
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $(`tab-${btn.dataset.tab}`).classList.add("active");

      if (btn.dataset.tab === "profiles" && profileType === "agents") {
        loadAgentProfiles();
      }
    });
  });

  // Main tab event listeners
  $("btn-capture").addEventListener("click", captureConsciousness);
  $("btn-refresh").addEventListener("click", loadSnapshots);
  $("btn-send-msg").addEventListener("click", sendMessage);
  $("btn-inject").addEventListener("click", () => injectSnapshot("inject"));
  $("btn-copy-prompt").addEventListener("click", () => injectSnapshot("clipboard"));
  $("btn-export-anyway").addEventListener("click", exportAnyway);
  $("btn-conflict-cancel").addEventListener("click", closeConflictDialog);
  $("btn-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  // Profiles tab event listeners
  $("pt-agents").addEventListener("click", () => switchProfileType("agents"));
  $("pt-blueprints").addEventListener("click", () => switchProfileType("blueprints"));
  $("btn-profile-inject").addEventListener("click", () => profileInject("inject"));
  $("btn-profile-copy").addEventListener("click", () => profileInject("clipboard"));
  $("btn-load-library").addEventListener("click", installSoulLibrary);
  $("bp-category-filter").addEventListener("change", e => loadSoulBlueprints(e.target.value));
}

document.addEventListener("DOMContentLoaded", init);

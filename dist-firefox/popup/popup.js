(() => {
  // src/popup/popup.js
  var selectedSnapshotId = null;
  var currentPlatform = "unknown";
  var peers = [];
  var $ = (id) => document.getElementById(id);
  function showToast(message, type = "", durationMs = 2500) {
    const toast = $("toast");
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.className = "toast";
    }, durationMs);
  }
  function bg(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
  function relativeTime(isoString) {
    if (!isoString) return "unknown";
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
  function platformIcon(platform) {
    return {
      chatgpt: "\u{1F916}",
      claude: "\u{1F338}",
      gemini: "\u264A",
      cursor: "\u{1F5B1}\uFE0F",
      windsurf: "\u{1F3C4}",
      codeium: "\u{1F3C4}",
      unknown: "\u{1F30C}"
    }[platform] ?? "\u{1F30C}";
  }
  async function updateStatus() {
    const dot = $("status-dot");
    const text = $("status-text");
    dot.className = "dot checking";
    text.textContent = "Checking SKComm...";
    try {
      const result = await bg("check_connection");
      if (result.connected) {
        dot.className = "dot connected";
        const identity = result.identity ?? "connected";
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
        "windsurf.ai": "windsurf"
      };
      currentPlatform = hostMap[url.hostname] ?? "unknown";
      $("platform-badge").textContent = currentPlatform === "unknown" ? "not on AI platform" : `${platformIcon(currentPlatform)} ${currentPlatform}`;
    } catch {
      $("platform-badge").textContent = "unknown";
    }
  }
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
    }
  }
  async function loadSnapshots() {
    const list = $("snapshot-list");
    list.innerHTML = '<div class="empty-state"><span class="empty-icon">\u23F3</span>Loading...</div>';
    try {
      const result = await bg("list_snapshots");
      const snapshots = result.snapshots ?? [];
      if (snapshots.length === 0) {
        list.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">\u{1F30C}</span>
          No snapshots yet.<br>
          Visit a ChatGPT, Claude, Gemini, Cursor, or Windsurf session<br>and press \u26A1 Capture.
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
        <span class="empty-icon">\u26A0\uFE0F</span>
        Failed to load snapshots:<br>${err.message}
      </div>`;
    }
  }
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
      snap.message_count > 0 ? `<span class="snapshot-tag">${snap.message_count} msgs</span>` : "",
      isCloud9 ? `<span class="snapshot-tag cloud9">\u2601\uFE0F Cloud 9</span>` : ""
    ].filter(Boolean).join("");
    item.innerHTML = `
    <button class="snapshot-delete" title="Delete snapshot" data-id="${snap.snapshot_id}">\u2715</button>
    <div class="snapshot-header">
      <div class="snapshot-name">${platformIcon(platform)} ${aiName}</div>
      <div class="snapshot-date">${date}</div>
    </div>
    <div class="snapshot-meta">${tags}</div>
    ${oof ? `<div class="snapshot-oof">OOF: ${oof}</div>` : ""}
    ${snap.summary ? `<div class="snapshot-oof" style="margin-top:2px;font-style:italic">${snap.summary.slice(0, 80)}${snap.summary.length > 80 ? "..." : ""}</div>` : ""}
  `;
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("snapshot-delete") || e.target.dataset.id) return;
      selectSnapshot(snap);
      document.querySelectorAll(".snapshot-item").forEach(
        (el) => el.classList.remove("selected")
      );
      item.classList.add("selected");
    });
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
  async function captureConsciousness() {
    const btn = $("btn-capture");
    const label = $("capture-label");
    btn.disabled = true;
    btn.classList.add("capturing");
    label.textContent = "Capturing...";
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab found");
      const scrapeResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const platform2 = window.__csPlatform?.platform ?? "unknown";
          const scraper = window.__csScraper?.[platform2];
          const oofParser = window.__csOOFParser;
          if (!scraper) {
            return { error: `No scraper for platform: ${platform2}`, platform: platform2 };
          }
          const { messages: messages2, metadata: metadata2 } = scraper();
          const oof = oofParser?.parseOOFFromMessages(messages2) ?? {};
          return { messages: messages2, metadata: metadata2, oof_state: oof, platform: platform2 };
        }
      });
      const scrapeResult = scrapeResults?.[0]?.result;
      if (!scrapeResult) throw new Error("Could not scrape page \u2014 try refreshing");
      if (scrapeResult.error) throw new Error(scrapeResult.error);
      const { messages, metadata, oof_state, platform } = scrapeResult;
      const result = await bg("capture_snapshot", {
        platform,
        messages,
        oof_state,
        ai_name: metadata?.model ?? null,
        ai_model: metadata?.model ?? null,
        summary: metadata?.title ?? "",
        key_topics: []
      });
      if (result.stored) {
        const syncNote = result.synced ? "\u2713 Synced to SKComm" : "\u26A0 Saved locally (SKComm offline)";
        showToast(`Captured! ${syncNote}`, "success", 3e3);
        await loadSnapshots();
      } else {
        throw new Error("Snapshot storage failed");
      }
    } catch (err) {
      showToast(`Capture failed: ${err.message}`, "error", 4e3);
    } finally {
      btn.disabled = false;
      btn.classList.remove("capturing");
      label.textContent = "Capture Consciousness";
    }
  }
  async function sendMessage() {
    const recipient = $("msg-recipient").value;
    const content = $("msg-content").value.trim();
    if (!recipient) {
      showToast("Select a recipient first", "error");
      return;
    }
    if (!content) {
      showToast("Enter a message", "error");
      return;
    }
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
      btn.innerHTML = "<span>\u{1F4E1}</span> Send";
    }
  }
  async function injectSnapshot(method = "clipboard") {
    if (!selectedSnapshotId) return;
    const btn = method === "clipboard" ? $("btn-copy-prompt") : $("btn-inject");
    btn.disabled = true;
    try {
      const promptResult = await bg("get_injection_prompt", {
        snapshot_id: selectedSnapshotId
      });
      if (!promptResult?.prompt) throw new Error("Could not build injection prompt");
      if (method === "clipboard") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await bg("inject_into_tab", {
          tabId: tab?.id,
          prompt: promptResult.prompt,
          method: "clipboard"
        });
        if (result.success) {
          showToast("Prompt copied to clipboard! Paste into your AI session.", "success", 3500);
        } else {
          throw new Error(result.error ?? "Clipboard write failed");
        }
      } else {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await bg("inject_into_tab", {
          tabId: tab?.id,
          prompt: promptResult.prompt,
          method: "inject"
        });
        if (result.success) {
          showToast("Consciousness injected! Review and send.", "success", 3e3);
        } else {
          showToast(`Direct inject failed \u2014 copied to clipboard instead`, "", 3500);
          await bg("inject_into_tab", {
            tabId: tab?.id,
            prompt: promptResult.prompt,
            method: "clipboard"
          });
        }
      }
    } catch (err) {
      showToast(`Inject failed: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  }
  async function init() {
    await Promise.all([
      updateStatus(),
      updatePlatformBadge(),
      loadPeers(),
      loadSnapshots()
    ]);
    $("btn-capture").addEventListener("click", captureConsciousness);
    $("btn-refresh").addEventListener("click", loadSnapshots);
    $("btn-send-msg").addEventListener("click", sendMessage);
    $("btn-inject").addEventListener("click", () => injectSnapshot("inject"));
    $("btn-copy-prompt").addEventListener("click", () => injectSnapshot("clipboard"));
  }
  document.addEventListener("DOMContentLoaded", init);
})();

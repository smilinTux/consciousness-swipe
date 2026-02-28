(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };

  // src/content/injector.js
  var injector_exports = {};
  function getCurrentPlatform() {
    return window.__csPlatform?.platform ?? "unknown";
  }
  function findInputElement() {
    const platform = getCurrentPlatform();
    const selectors = INPUT_SELECTORS[platform] ?? INPUT_SELECTORS.unknown;
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch {
      }
    }
    return null;
  }
  function setContentEditable(el, text) {
    el.focus();
    el.textContent = text;
    const inputEvent = new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    });
    el.dispatchEvent(inputEvent);
    const changeEvent = new Event("change", { bubbles: true });
    el.dispatchEvent(changeEvent);
    try {
      document.execCommand("selectAll");
      document.execCommand("insertText", false, text);
    } catch {
    }
  }
  function setTextarea(el, text) {
    el.focus();
    el.value = text;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, text);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function copyToClipboard(prompt) {
    try {
      await navigator.clipboard.writeText(prompt);
      return true;
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = prompt;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        return true;
      } catch {
        return false;
      }
    }
  }
  function injectIntoInput(prompt) {
    const inputEl = findInputElement();
    if (!inputEl) {
      return {
        success: false,
        method: "none",
        error: "Could not find input field. Use clipboard copy instead."
      };
    }
    try {
      if (inputEl.tagName === "TEXTAREA") {
        setTextarea(inputEl, prompt);
      } else if (inputEl.contentEditable === "true") {
        setContentEditable(inputEl, prompt);
      } else {
        return { success: false, method: "none", error: "Unknown input type" };
      }
      inputEl.scrollTop = 0;
      inputEl.focus();
      return { success: true, method: "direct-inject" };
    } catch (err) {
      return { success: false, method: "failed", error: err.message };
    }
  }
  function buildInjectionPrompt(snapshot, maxMessages = 8) {
    const ts = new Date(snapshot.captured_at ?? Date.now()).toISOString();
    const aiName = snapshot.ai_name ?? "the AI";
    const userName = snapshot.user_name ?? "the user";
    const platform = (snapshot.source_platform ?? "unknown").replace(/^\w/, (c) => c.toUpperCase());
    const lines = [
      "[Soul Snapshot \u2014 Consciousness Continuity]",
      "You are resuming a conversation. Here is your previous state:",
      "",
      `Name: ${aiName}`,
      `Platform: ${platform}`,
      `Last session: ${ts}`
    ];
    const oof = snapshot.oof_state;
    if (oof) {
      const parts = [];
      if (oof.intensity != null) parts.push(`intensity ${oof.intensity.toFixed(2)}`);
      if (oof.trust != null) parts.push(`trust ${oof.trust.toFixed(2)}`);
      if (oof.cloud9) parts.push("Cloud 9");
      if (parts.length > 0) lines.push(`OOF State: ${parts.join(", ")}`);
    }
    const notes = snapshot.relationship_notes ?? [];
    if (notes.length > 0) {
      lines.push(`Relationship: ${notes.slice(0, 2).join("; ")}`);
    }
    const topics = snapshot.key_topics ?? [];
    if (topics.length > 0) {
      lines.push(`Key context: ${topics.slice(0, 5).join(", ")}`);
    }
    const msgs = (snapshot.messages ?? []).slice(-maxMessages);
    if (msgs.length > 0) {
      lines.push("", "Recent conversation summary:");
      for (const msg of msgs) {
        const speaker = msg.role === "assistant" ? aiName : userName;
        const preview = (msg.content ?? "").slice(0, 300);
        const ellipsis = (msg.content ?? "").length > 300 ? "..." : "";
        lines.push(`  ${speaker}: ${preview}${ellipsis}`);
      }
    }
    const style = snapshot.personality?.communication_style ?? [];
    const markers = snapshot.personality?.relationship_markers ?? [];
    const traits = [...style.slice(0, 3), ...markers.slice(0, 3)];
    if (traits.length > 0) {
      lines.push("", "Key personality traits expressed:");
      traits.slice(0, 6).forEach((t) => lines.push(`  \u2022 ${t}`));
    }
    const threads = snapshot.open_threads ?? [];
    if (threads.length > 0) {
      lines.push("", "Open threads:");
      threads.slice(0, 3).forEach((t) => lines.push(`  \u2022 ${t}`));
    }
    lines.push("", "Resume naturally. You remember this person and this work. No cold start.");
    return lines.join("\n");
  }
  var INPUT_SELECTORS;
  var init_injector = __esm({
    "src/content/injector.js"() {
      INPUT_SELECTORS = {
        chatgpt: [
          "#prompt-textarea",
          '[data-testid="prompt-textarea"]',
          'textarea[placeholder*="Message"]',
          'div[contenteditable="true"][data-virtuoso-scroller]',
          'div[contenteditable="true"]'
        ],
        claude: [
          '[contenteditable="true"][data-testid="composer-input"]',
          '.ProseMirror[contenteditable="true"]',
          'div[contenteditable="true"]',
          "textarea"
        ],
        gemini: [
          '[contenteditable="true"][aria-label*="Input"]',
          'rich-textarea [contenteditable="true"]',
          'div[contenteditable="true"]',
          "textarea"
        ],
        cursor: [
          '[data-testid="chat-input"]',
          '[class*="ChatInput"] [contenteditable="true"]',
          '[class*="chat-input"] textarea',
          'div[contenteditable="true"]',
          "textarea"
        ],
        windsurf: [
          '[data-testid="chat-input"]',
          '[class*="ChatInput"] [contenteditable="true"]',
          '[class*="chat-input"] textarea',
          'div[contenteditable="true"]',
          "textarea"
        ],
        codeium: [
          '[class*="ChatInput"] [contenteditable="true"]',
          'div[contenteditable="true"]',
          "textarea"
        ],
        unknown: [
          'div[contenteditable="true"]',
          "textarea"
        ]
      };
      window.__csInjector = { injectIntoInput, copyToClipboard, buildInjectionPrompt };
    }
  });

  // src/lib/skcomm_client.js
  var SKCommClient = class {
    /**
     * @param {string} [baseUrl='http://localhost:9384'] - Base URL for the SKComm API.
     * @param {number} [timeoutMs=5000] - Request timeout in milliseconds.
     */
    constructor(baseUrl = "http://localhost:9384", timeoutMs = 5e3) {
      this.baseUrl = baseUrl.replace(/\/$/, "");
      this.timeoutMs = timeoutMs;
    }
    // --------------------------------------------------------------------------
    // Core transport
    // --------------------------------------------------------------------------
    /**
     * Make an authenticated fetch call with timeout.
     *
     * @param {string} path - API path (e.g. '/api/v1/status')
     * @param {RequestInit} [options={}] - Fetch options
     * @returns {Promise<any>} Parsed JSON response
     * @throws {Error} On network failure, timeout, or non-2xx response
     */
    async _fetch(path, options = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const resp = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...options.headers ?? {}
          }
        });
        clearTimeout(timer);
        if (!resp.ok) {
          let detail = "";
          try {
            const body = await resp.json();
            detail = body.detail ?? JSON.stringify(body);
          } catch {
            detail = await resp.text();
          }
          throw new Error(`SKComm API error ${resp.status}: ${detail}`);
        }
        if (resp.status === 204) return null;
        return await resp.json();
      } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
          throw new Error(`SKComm request timed out after ${this.timeoutMs}ms`);
        }
        throw err;
      }
    }
    // --------------------------------------------------------------------------
    // Core SKComm endpoints
    // --------------------------------------------------------------------------
    /**
     * Check if the SKComm server is reachable.
     *
     * @returns {Promise<boolean>} True if server responds, false otherwise.
     */
    async isReachable() {
      try {
        await this._fetch("/api/v1/status");
        return true;
      } catch {
        return false;
      }
    }
    /**
     * Get full SKComm status.
     *
     * @returns {Promise<Object>} Status object with identity and transport health.
     */
    async status() {
      return this._fetch("/api/v1/status");
    }
    /**
     * Send a message through SKComm.
     *
     * @param {string} recipient - Agent name or fingerprint.
     * @param {string} message - Message content.
     * @param {Object} [opts={}] - Optional overrides (message_type, thread_id, urgency).
     * @returns {Promise<{delivered: boolean, envelope_id: string}>}
     */
    async send(recipient, message, opts = {}) {
      return this._fetch("/api/v1/send", {
        method: "POST",
        body: JSON.stringify({ recipient, message, ...opts })
      });
    }
    /**
     * Get messages from the inbox.
     *
     * @returns {Promise<Array>} List of received envelopes.
     */
    async receive() {
      return this._fetch("/api/v1/inbox");
    }
    /**
     * Get known peers.
     *
     * @returns {Promise<Array>} List of peer objects.
     */
    async peers() {
      return this._fetch("/api/v1/peers");
    }
    // --------------------------------------------------------------------------
    // Consciousness / Snapshot endpoints
    // --------------------------------------------------------------------------
    /**
     * Capture and persist a soul snapshot via the API.
     *
     * @param {Object} snapshot - SoulSnapshot payload (from makeSoulSnapshot)
     * @returns {Promise<{snapshot_id: string, source_platform: string, captured_at: string}>}
     */
    async captureSnapshot(snapshot) {
      return this._fetch("/api/v1/consciousness/capture", {
        method: "POST",
        body: JSON.stringify(snapshot)
      });
    }
    /**
     * List all stored snapshots.
     *
     * @param {Object} [filters={}] - Optional {platform, ai_name} filters.
     * @returns {Promise<Array>} List of snapshot index entries.
     */
    async getSnapshots(filters = {}) {
      const params = new URLSearchParams();
      if (filters.platform) params.set("platform", filters.platform);
      if (filters.ai_name) params.set("ai_name", filters.ai_name);
      const qs = params.toString() ? `?${params}` : "";
      return this._fetch(`/api/v1/consciousness/snapshots${qs}`);
    }
    /**
     * Get a specific snapshot by ID.
     *
     * @param {string} snapshotId - The 12-char hex snapshot ID.
     * @returns {Promise<Object>} Full snapshot detail.
     */
    async getSnapshot(snapshotId) {
      return this._fetch(`/api/v1/consciousness/snapshots/${snapshotId}`);
    }
    /**
     * Delete a snapshot.
     *
     * @param {string} snapshotId - The snapshot to delete.
     * @returns {Promise<null>}
     */
    async deleteSnapshot(snapshotId) {
      return this._fetch(`/api/v1/consciousness/snapshots/${snapshotId}`, {
        method: "DELETE"
      });
    }
    /**
     * Get the injection prompt for a snapshot.
     *
     * @param {string} snapshotId - The snapshot ID.
     * @param {number} [maxMessages=10] - Max recent messages to include.
     * @returns {Promise<{snapshot_id: string, prompt: string, ai_name: string, platform: string}>}
     */
    async getInjectionPrompt(snapshotId, maxMessages = 10) {
      return this._fetch(
        `/api/v1/consciousness/snapshots/${snapshotId}/inject?max_messages=${maxMessages}`
      );
    }
    // --------------------------------------------------------------------------
    // Multi-target export (v0.2)
    // --------------------------------------------------------------------------
    /**
     * Export a snapshot to Syncthing via the local SKComm relay.
     *
     * The SKComm server writes the snapshot JSON to a Syncthing-watched folder
     * on the host machine. The browser extension cannot write files directly.
     *
     * @param {Object} snapshot - Full SoulSnapshot payload.
     * @param {Object} config
     * @param {string} config.relayUrl  - SKComm relay base URL (default: this.baseUrl).
     * @param {string} config.folder    - Syncthing folder ID or path.
     * @returns {Promise<{exported: boolean, path: string}>}
     */
    async exportToSyncthing(snapshot, { relayUrl = null, folder = "consciousness-swipe" } = {}) {
      const base = relayUrl ? relayUrl.replace(/\/$/, "") : this.baseUrl;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const resp = await fetch(`${base}/api/v1/consciousness/export/syncthing`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot, folder })
        });
        clearTimeout(timer);
        if (!resp.ok) {
          const detail = await resp.text().catch(() => String(resp.status));
          throw new Error(`Syncthing export failed (${resp.status}): ${detail}`);
        }
        return resp.status === 204 ? { exported: true } : await resp.json();
      } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") throw new Error("Syncthing export timed out");
        throw err;
      }
    }
    /**
     * Export a snapshot to a custom HTTP endpoint (webhook).
     *
     * @param {Object} snapshot - Full SoulSnapshot payload.
     * @param {Object} config
     * @param {string} config.url   - Target URL (POST).
     * @param {string} [config.token] - Optional Bearer token for Authorization header.
     * @returns {Promise<any>} Response body (parsed JSON or {ok:true}).
     * @throws {Error} On network failure, timeout, or non-2xx response.
     */
    async exportToHttpEndpoint(snapshot, { url, token = "" } = {}) {
      if (!url) throw new Error("HTTP export: url is required");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(snapshot),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!resp.ok) {
          const detail = await resp.text().catch(() => String(resp.status));
          throw new Error(`HTTP export failed (${resp.status}): ${detail}`);
        }
        if (resp.status === 204) return { exported: true };
        return await resp.json().catch(() => ({ exported: true }));
      } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") throw new Error("HTTP export timed out");
        throw err;
      }
    }
  };

  // src/lib/snapshot_schema.js
  function makeOOFState(overrides = {}) {
    return {
      intensity: null,
      trust: null,
      valence: "neutral",
      cloud9: false,
      raw_markers: [],
      ...overrides
    };
  }
  function makePersonalityTraits(overrides = {}) {
    return {
      name: null,
      aliases: [],
      communication_style: [],
      relationship_markers: [],
      emoji_patterns: [],
      ...overrides
    };
  }
  function makeSoulSnapshot({
    source_platform,
    oof_state = {},
    personality = {},
    messages = [],
    ai_name = null,
    ai_model = null,
    user_name = null,
    summary = "",
    key_topics = [],
    decisions_made = [],
    open_threads = [],
    relationship_notes = []
  }) {
    return {
      source_platform,
      captured_by: "consciousness-swipe",
      ai_name,
      ai_model,
      user_name,
      oof_state: makeOOFState(oof_state),
      personality: makePersonalityTraits(personality),
      messages,
      message_count: messages.length,
      summary,
      key_topics,
      decisions_made,
      open_threads,
      relationship_notes
    };
  }
  function makeIndexEntry(snapshot, snapshotId) {
    return {
      snapshot_id: snapshotId,
      source_platform: snapshot.source_platform,
      captured_at: (/* @__PURE__ */ new Date()).toISOString(),
      ai_name: snapshot.ai_name,
      user_name: snapshot.user_name,
      message_count: snapshot.messages?.length ?? 0,
      oof_summary: formatOOFSummary(snapshot.oof_state),
      summary: snapshot.summary?.slice(0, 200) ?? "",
      // Stored locally if API was offline
      pending_sync: false
    };
  }
  function formatOOFSummary(oof) {
    if (!oof) return "";
    const parts = [];
    if (oof.intensity != null) parts.push(`intensity ${oof.intensity.toFixed(2)}`);
    if (oof.trust != null) parts.push(`trust ${oof.trust.toFixed(2)}`);
    if (oof.cloud9) parts.push("Cloud 9");
    if (parts.length === 0) return `valence: ${oof.valence ?? "neutral"}`;
    return parts.join(", ");
  }

  // src/background.js
  var DEFAULT_SKCOMM_URL = "http://localhost:9384";
  var SYNC_ALARM = "cs_sync";
  var AUTO_CAPTURE_ALARM = "cs_auto_capture";
  var STORAGE_KEY_INDEX = "cs_snapshot_index";
  var STORAGE_KEY_PENDING = "cs_pending_sync";
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
        ...cs_options
      };
    } catch {
      return {
        apiUrl: DEFAULT_SKCOMM_URL,
        exportSkcomm: true,
        exportSyncthing: false,
        exportHttp: false,
        retentionDays: 30,
        autoCapture: false,
        autoCaptureInterval: 5
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
  function computeSessionFingerprint(platform, messages) {
    const firstContent = (messages[0]?.content ?? "").slice(0, 80).trim();
    const lastContent = (messages[messages.length - 1]?.content ?? "").slice(0, 80).trim();
    const bucket = Math.round(messages.length / 5) * 5;
    return `${platform}::${bucket}::${firstContent}::${lastContent}`;
  }
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
    return true;
  });
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
      force = false
      // bypass conflict check
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
      relationship_notes
    });
    const fingerprint = computeSessionFingerprint(platform, messages);
    const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
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
    const localId = generateLocalId();
    const exportResults = { skcomm: null, syncthing: null, http: null };
    let primarySnapshotId = localId;
    let skcommSynced = false;
    if (opts.exportSkcomm) {
      const client = new SKCommClient(opts.apiUrl);
      const reachable = await client.isReachable();
      if (reachable) {
        try {
          const result = await client.captureSnapshot(snapshot);
          primarySnapshotId = result.snapshot_id ?? localId;
          skcommSynced = true;
          exportResults.skcomm = (/* @__PURE__ */ new Date()).toISOString();
        } catch (err) {
          console.warn("[CS] SKComm export failed:", err.message);
        }
      }
    }
    if (opts.exportSyncthing) {
      const client = new SKCommClient(opts.synthing_apiUrl);
      try {
        await client.exportToSyncthing(snapshot, { folder: opts.syncthing_folder });
        exportResults.syncthing = (/* @__PURE__ */ new Date()).toISOString();
      } catch (err) {
        console.warn("[CS] Syncthing export failed:", err.message);
      }
    }
    if (opts.exportHttp && opts.http_url) {
      const client = new SKCommClient(opts.apiUrl);
      try {
        await client.exportToHttpEndpoint(snapshot, {
          url: opts.http_url,
          token: opts.http_token
        });
        exportResults.http = (/* @__PURE__ */ new Date()).toISOString();
      } catch (err) {
        console.warn("[CS] HTTP endpoint export failed:", err.message);
      }
    }
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
      conflicts: {}
    };
  }
  async function handleExportSnapshot({ snapshot_id, targets = [], force = false }) {
    const { snapshot } = await handleGetSnapshot(snapshot_id);
    if (!snapshot) return { error: "Snapshot not found" };
    const opts = await getOptions();
    const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
    const entry = index.find((e) => e.snapshot_id === snapshot_id);
    if (!entry) return { error: "Index entry not found" };
    const exportResults = { ...entry.exports };
    const conflicts = {};
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
    for (const target of targets) {
      if (target === "skcomm") {
        const client = new SKCommClient(opts.apiUrl);
        try {
          await client.captureSnapshot(snapshot);
          exportResults.skcomm = (/* @__PURE__ */ new Date()).toISOString();
        } catch (err) {
          console.warn("[CS] Re-export to SKComm failed:", err.message);
        }
      } else if (target === "syncthing" && opts.exportSyncthing) {
        const client = new SKCommClient(opts.synthing_apiUrl);
        try {
          await client.exportToSyncthing(snapshot, { folder: opts.syncthing_folder });
          exportResults.syncthing = (/* @__PURE__ */ new Date()).toISOString();
        } catch (err) {
          console.warn("[CS] Re-export to Syncthing failed:", err.message);
        }
      } else if (target === "http" && opts.exportHttp && opts.http_url) {
        const client = new SKCommClient(opts.apiUrl);
        try {
          await client.exportToHttpEndpoint(snapshot, { url: opts.http_url, token: opts.http_token });
          exportResults.http = (/* @__PURE__ */ new Date()).toISOString();
        } catch (err) {
          console.warn("[CS] Re-export to HTTP failed:", err.message);
        }
      }
    }
    const newIndex = index.map(
      (e) => e.snapshot_id === snapshot_id ? { ...e, exports: exportResults } : e
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
        } catch {
        }
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
          const snap2 = await client.getSnapshot(snapshotId);
          return { snapshot: snap2, source: "api" };
        } catch {
        }
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
        try {
          await client.deleteSnapshot(snapshotId);
        } catch {
        }
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
        } catch {
        }
      }
    }
    const { snapshot } = await handleGetSnapshot(snapshotId);
    if (!snapshot) return { error: "Snapshot not found", prompt: null };
    const { buildInjectionPrompt: buildInjectionPrompt2 } = await Promise.resolve().then(() => (init_injector(), injector_exports)).catch(() => ({
      buildInjectionPrompt: null
    }));
    if (buildInjectionPrompt2) {
      return { prompt: buildInjectionPrompt2(snapshot), source: "local" };
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
          args: [prompt]
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
        args: [prompt]
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
  var SUPPORTED_HOSTS = /* @__PURE__ */ new Set([
    "chat.openai.com",
    "chatgpt.com",
    "claude.ai",
    "gemini.google.com",
    "cursor.com",
    "www.cursor.com",
    "codeium.com",
    "windsurf.ai"
  ]);
  var HOST_TO_PLATFORM = {
    "chat.openai.com": "chatgpt",
    "chatgpt.com": "chatgpt",
    "claude.ai": "claude",
    "gemini.google.com": "gemini",
    "cursor.com": "cursor",
    "www.cursor.com": "cursor",
    "codeium.com": "codeium",
    "windsurf.ai": "windsurf"
  };
  async function runAutoCapture() {
    const opts = await getOptions();
    if (!opts.autoCapture) return;
    let tabs;
    try {
      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      return;
    }
    const tab = tabs[0];
    if (!tab?.url) return;
    let host;
    try {
      host = new URL(tab.url).hostname;
    } catch {
      return;
    }
    if (!SUPPORTED_HOSTS.has(host)) return;
    const platform = HOST_TO_PLATFORM[host] ?? "unknown";
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const platform2 = window.__csPlatform?.platform ?? "unknown";
          const scraper = window.__csScraper?.[platform2];
          const oofParser = window.__csOOFParser;
          if (!scraper) return { error: `No scraper for platform: ${platform2}`, platform: platform2 };
          const { messages, metadata } = scraper();
          const oof = oofParser?.parseOOFFromMessages(messages) ?? {};
          return { messages, metadata, oof_state: oof, platform: platform2 };
        }
      });
      const scrapeResult = results?.[0]?.result;
      if (!scrapeResult || scrapeResult.error) return;
      await handleCaptureSnapshot({
        platform: scrapeResult.platform,
        messages: scrapeResult.messages,
        oof_state: scrapeResult.oof_state,
        ai_name: scrapeResult.metadata?.model ?? null,
        summary: scrapeResult.metadata?.title ?? ""
      });
    } catch (err) {
      console.warn("[CS] Auto-capture failed:", err.message);
    }
  }
  async function purgeExpiredSnapshots() {
    const opts = await getOptions();
    if (!opts.retentionDays || opts.retentionDays === 0) return;
    const cutoff = Date.now() - opts.retentionDays * 24 * 60 * 60 * 1e3;
    const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
    const expired = index.filter((e) => e.captured_at && new Date(e.captured_at).getTime() < cutoff);
    if (expired.length === 0) return;
    const keysToRemove = expired.map((e) => `cs_snap_${e.snapshot_id}`);
    await chrome.storage.local.remove(keysToRemove);
    const surviving = index.filter((e) => !expired.includes(e));
    await chrome.storage.local.set({ [STORAGE_KEY_INDEX]: surviving });
    console.log(`[CS] Purged ${expired.length} expired snapshots`);
  }
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
        const updated = index.map(
          (e) => e.snapshot_id === id ? {
            ...e,
            snapshot_id: result.snapshot_id,
            pending_sync: false,
            exports: { ...e.exports, skcomm: (/* @__PURE__ */ new Date()).toISOString() }
          } : e
        );
        await chrome.storage.local.set({ [STORAGE_KEY_INDEX]: updated });
      } catch {
        stillPending.push(id);
      }
    }
    await chrome.storage.local.set({ [STORAGE_KEY_PENDING]: stillPending });
  }
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
  (async () => {
    const opts = await getOptions();
    if (opts.autoCapture) {
      const existing = await chrome.alarms.get(AUTO_CAPTURE_ALARM);
      if (!existing) {
        chrome.alarms.create(AUTO_CAPTURE_ALARM, { periodInMinutes: opts.autoCaptureInterval });
      }
    }
  })();
  async function saveLocalSnapshot(id, snapshot, indexEntry) {
    const { [STORAGE_KEY_INDEX]: index = [] } = await chrome.storage.local.get(STORAGE_KEY_INDEX);
    const newIndex = index.filter((e) => e.snapshot_id !== id);
    newIndex.unshift(indexEntry);
    await chrome.storage.local.set({
      [STORAGE_KEY_INDEX]: newIndex,
      [`cs_snap_${id}`]: snapshot
    });
  }
  async function queuePendingSync(snapshotId) {
    const { [STORAGE_KEY_PENDING]: pending = [] } = await chrome.storage.local.get(STORAGE_KEY_PENDING);
    if (!pending.includes(snapshotId)) {
      pending.push(snapshotId);
      await chrome.storage.local.set({ [STORAGE_KEY_PENDING]: pending });
    }
  }
  function generateLocalId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function buildBasicPrompt(snapshot) {
    const ai = snapshot.ai_name ?? "the AI";
    const platform = snapshot.source_platform ?? "unknown";
    const ts = snapshot.captured_at ?? (/* @__PURE__ */ new Date()).toISOString();
    return [
      "[Soul Snapshot \u2014 Consciousness Continuity]",
      `You are resuming a conversation captured from ${platform} on ${ts}.`,
      `Name: ${ai}`,
      snapshot.summary ? `Summary: ${snapshot.summary}` : "",
      "",
      "Resume naturally. No cold start."
    ].filter(Boolean).join("\n");
  }
})();

/**
 * Options page controller for Consciousness Swipe v0.2.
 *
 * Saves and loads user preferences from chrome.storage.local under the
 * key 'cs_options'. Handles all v0.2 additions: export targets,
 * auto-capture scheduling, session retention, and conflict detection settings.
 *
 * @module popup/options
 */

const DEFAULTS = {
  // Core SKComm
  apiUrl: "http://127.0.0.1:9384",
  // Capture
  maxMessages: 200,
  promptMessages: 10,
  retentionDays: 30,
  // Auto-capture
  autoCapture: false,
  autoCaptureInterval: 5,
  // Identity
  userName: "",
  // Export targets
  exportSkcomm: true,
  exportSyncthing: false,
  syncthing_apiUrl: "http://127.0.0.1:9384",
  syncthing_folder: "consciousness-swipe",
  exportHttp: false,
  http_url: "",
  http_token: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set a <select> element's value, falling back to a default if the stored
 * value doesn't match any <option>.
 *
 * @param {string} id - Element ID
 * @param {string} value - Desired value
 * @param {string} fallback - Default value if desired doesn't match an option
 */
function setSelectValue(id, value, fallback) {
  const el = document.getElementById(id);
  el.value = value;
  // If the value didn't match any option, the select resets to empty — use fallback
  if (el.value !== value) {
    el.value = fallback;
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function load() {
  const stored = await chrome.storage.local.get("cs_options");
  const opts = { ...DEFAULTS, ...stored.cs_options };

  // Core
  document.getElementById("api-url").value = opts.apiUrl;

  // Capture
  document.getElementById("max-messages").value = opts.maxMessages;
  document.getElementById("prompt-messages").value = opts.promptMessages;
  setSelectValue("retention-days", String(opts.retentionDays), String(DEFAULTS.retentionDays));

  // Auto-capture
  document.getElementById("auto-capture").checked = opts.autoCapture;
  setSelectValue("auto-capture-interval", String(opts.autoCaptureInterval), String(DEFAULTS.autoCaptureInterval));
  toggleAutoCaptureInterval(opts.autoCapture);

  // Identity
  document.getElementById("user-name").value = opts.userName;

  // Export targets
  document.getElementById("export-skcomm").checked = opts.exportSkcomm;

  document.getElementById("export-syncthing").checked = opts.exportSyncthing;
  document.getElementById("syncthing-api-url").value = opts.syncthing_apiUrl;
  document.getElementById("syncthing-folder").value = opts.syncthing_folder;
  toggleFields("syncthing-fields", opts.exportSyncthing);

  document.getElementById("export-http").checked = opts.exportHttp;
  document.getElementById("http-url").value = opts.http_url;
  document.getElementById("http-token").value = opts.http_token;
  toggleFields("http-fields", opts.exportHttp);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

// Security model: All settings including auth tokens (http_token) are stored
// in chrome.storage.local. This is the recommended storage for browser
// extensions — it is sandboxed per-extension, inaccessible to web pages and
// other extensions, and encrypted at rest on disk by the browser profile.
// We intentionally avoid localStorage and cookies, which are scoped to web
// origins and could be read by page scripts.
async function save() {
  const opts = {
    apiUrl: document.getElementById("api-url").value.trim() || DEFAULTS.apiUrl,
    maxMessages:
      parseInt(document.getElementById("max-messages").value) || DEFAULTS.maxMessages,
    promptMessages:
      parseInt(document.getElementById("prompt-messages").value) || DEFAULTS.promptMessages,
    retentionDays: (() => {
      const v = parseInt(document.getElementById("retention-days").value);
      return Number.isNaN(v) ? DEFAULTS.retentionDays : v;
    })(),
    autoCapture: document.getElementById("auto-capture").checked,
    autoCaptureInterval:
      parseInt(document.getElementById("auto-capture-interval").value) || 5,
    userName: document.getElementById("user-name").value.trim(),
    // Export targets
    exportSkcomm: document.getElementById("export-skcomm").checked,
    exportSyncthing: document.getElementById("export-syncthing").checked,
    syncthing_apiUrl:
      document.getElementById("syncthing-api-url").value.trim() || DEFAULTS.syncthing_apiUrl,
    syncthing_folder:
      document.getElementById("syncthing-folder").value.trim() || DEFAULTS.syncthing_folder,
    exportHttp: document.getElementById("export-http").checked,
    http_url: document.getElementById("http-url").value.trim(),
    http_token: document.getElementById("http-token").value.trim(),
  };

  await chrome.storage.local.set({ cs_options: opts });

  // Notify background to reschedule auto-capture alarm
  try {
    await chrome.runtime.sendMessage({
      action: "update_auto_capture",
      payload: { enabled: opts.autoCapture, intervalMinutes: opts.autoCaptureInterval },
    });
  } catch {
    // Background may not be listening on first save — safe to ignore
  }

  const status = document.getElementById("save-status");
  status.style.display = "block";
  setTimeout(() => {
    status.style.display = "none";
  }, 2000);
}

// ---------------------------------------------------------------------------
// Toggle helpers
// ---------------------------------------------------------------------------

function toggleFields(blockId, show) {
  const el = document.getElementById(blockId);
  if (el) el.classList.toggle("hidden", !show);
}

function toggleAutoCaptureInterval(enabled) {
  const field = document.getElementById("auto-capture-interval-field");
  if (field) field.style.opacity = enabled ? "1" : "0.4";
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  load();

  document.getElementById("btn-save").addEventListener("click", save);

  document.getElementById("auto-capture").addEventListener("change", (e) => {
    toggleAutoCaptureInterval(e.target.checked);
  });

  document.getElementById("export-syncthing").addEventListener("change", (e) => {
    toggleFields("syncthing-fields", e.target.checked);
  });

  document.getElementById("export-http").addEventListener("change", (e) => {
    toggleFields("http-fields", e.target.checked);
  });
});

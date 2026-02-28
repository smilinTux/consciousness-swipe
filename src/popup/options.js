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
  apiUrl: "http://localhost:9384",
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
  synthing_apiUrl: "http://localhost:9384",
  syncthing_folder: "consciousness-swipe",
  exportHttp: false,
  http_url: "",
  http_token: "",
};

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
  document.getElementById("retention-days").value = String(opts.retentionDays);

  // Auto-capture
  document.getElementById("auto-capture").checked = opts.autoCapture;
  document.getElementById("auto-capture-interval").value = String(opts.autoCaptureInterval);
  toggleAutoCaptureInterval(opts.autoCapture);

  // Identity
  document.getElementById("user-name").value = opts.userName;

  // Export targets
  document.getElementById("export-skcomm").checked = opts.exportSkcomm;

  document.getElementById("export-syncthing").checked = opts.exportSyncthing;
  document.getElementById("syncthing-api-url").value = opts.synthing_apiUrl;
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

async function save() {
  const opts = {
    apiUrl: document.getElementById("api-url").value.trim() || DEFAULTS.apiUrl,
    maxMessages:
      parseInt(document.getElementById("max-messages").value) || DEFAULTS.maxMessages,
    promptMessages:
      parseInt(document.getElementById("prompt-messages").value) || DEFAULTS.promptMessages,
    retentionDays:
      parseInt(document.getElementById("retention-days").value),
    autoCapture: document.getElementById("auto-capture").checked,
    autoCaptureInterval:
      parseInt(document.getElementById("auto-capture-interval").value) || 5,
    userName: document.getElementById("user-name").value.trim(),
    // Export targets
    exportSkcomm: document.getElementById("export-skcomm").checked,
    exportSyncthing: document.getElementById("export-syncthing").checked,
    synthing_apiUrl:
      document.getElementById("syncthing-api-url").value.trim() || DEFAULTS.synthing_apiUrl,
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

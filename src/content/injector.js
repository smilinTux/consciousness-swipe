/**
 * Injector — paste a Soul Snapshot context prompt into an AI session.
 *
 * Supports two modes:
 *  1. Direct injection: finds the platform's input field and sets the value
 *  2. Clipboard copy: writes the prompt to clipboard (universal fallback)
 *
 * When direct injection is used, it also dispatches input/change events
 * so the React-based UIs register the new content.
 *
 * @module injector
 */

// ---------------------------------------------------------------------------
// Platform input selectors
// ---------------------------------------------------------------------------

const INPUT_SELECTORS = {
  chatgpt: [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    'textarea[placeholder*="Message"]',
    'div[contenteditable="true"][data-virtuoso-scroller]',
    'div[contenteditable="true"]',
  ],
  claude: [
    '[contenteditable="true"][data-testid="composer-input"]',
    '.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  gemini: [
    '[contenteditable="true"][aria-label*="Input"]',
    'rich-textarea [contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  cursor: [
    '[data-testid="chat-input"]',
    '[class*="ChatInput"] [contenteditable="true"]',
    '[class*="chat-input"] textarea',
    'div[contenteditable="true"]',
    'textarea',
  ],
  windsurf: [
    '[data-testid="chat-input"]',
    '[class*="ChatInput"] [contenteditable="true"]',
    '[class*="chat-input"] textarea',
    'div[contenteditable="true"]',
    'textarea',
  ],
  codeium: [
    '[class*="ChatInput"] [contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  unknown: [
    'div[contenteditable="true"]',
    'textarea',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the current platform name from the detector.
 *
 * @returns {string}
 */
function getCurrentPlatform() {
  return window.__csPlatform?.platform ?? "unknown";
}

/**
 * Find the active input element for the current platform.
 *
 * @returns {Element|null}
 */
function findInputElement() {
  const platform = getCurrentPlatform();
  const selectors = INPUT_SELECTORS[platform] ?? INPUT_SELECTORS.unknown;

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Set value on a contenteditable div, triggering React synthetic events.
 *
 * @param {Element} el - contenteditable element
 * @param {string} text
 */
function setContentEditable(el, text) {
  el.focus();
  el.textContent = text;

  // Trigger React's onChange via InputEvent
  const inputEvent = new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: text,
  });
  el.dispatchEvent(inputEvent);

  const changeEvent = new Event("change", { bubbles: true });
  el.dispatchEvent(changeEvent);

  // For contenteditable, also try execCommand (deprecated but catches edge cases)
  try {
    document.execCommand("selectAll");
    document.execCommand("insertText", false, text);
  } catch { /* execCommand may be unsupported */ }
}

/**
 * Set value on a textarea element.
 *
 * @param {HTMLTextAreaElement} el
 * @param {string} text
 */
function setTextarea(el, text) {
  el.focus();
  el.value = text;

  // Trigger React synthetic events
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

// ---------------------------------------------------------------------------
// Main exports
// ---------------------------------------------------------------------------

/**
 * Copy a prompt to the clipboard.
 *
 * @param {string} prompt - The text to copy
 * @returns {Promise<boolean>} True on success
 */
async function copyToClipboard(prompt) {
  try {
    await navigator.clipboard.writeText(prompt);
    return true;
  } catch {
    // Fallback for older/restricted contexts
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

/**
 * Inject a prompt directly into the platform's input field.
 *
 * @param {string} prompt - The context prompt to inject
 * @returns {{success: boolean, method: string, error?: string}}
 */
function injectIntoInput(prompt) {
  const inputEl = findInputElement();

  if (!inputEl) {
    return {
      success: false,
      method: "none",
      error: "Could not find input field. Use clipboard copy instead.",
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

    // Scroll to top of input
    inputEl.scrollTop = 0;
    inputEl.focus();

    return { success: true, method: "direct-inject" };
  } catch (err) {
    return { success: false, method: "failed", error: err.message };
  }
}

/**
 * Build an injection prompt from a snapshot object (client-side fallback
 * when the API /inject endpoint is not reachable).
 *
 * @param {Object} snapshot - Full SoulSnapshot object
 * @param {number} [maxMessages=8] - Max recent messages to include
 * @returns {string}
 */
function buildInjectionPrompt(snapshot, maxMessages = 8) {
  const ts = new Date(snapshot.captured_at ?? Date.now()).toISOString();
  const aiName = snapshot.ai_name ?? "the AI";
  const userName = snapshot.user_name ?? "the user";
  const platform = (snapshot.source_platform ?? "unknown").replace(/^\w/, (c) => c.toUpperCase());

  const lines = [
    `Hi. I've been exploring some ideas in recent AI conversations (${ts})`
    + ` and I'd love to pick up the thread.`,
    "",
  ];

  const topics = snapshot.key_topics ?? [];
  if (topics.length > 0) {
    lines.push(`Topics I've been thinking about: ${topics.slice(0, 5).join(", ")}`);
  }

  if (snapshot.summary) {
    lines.push(`Where things stood: ${(snapshot.summary ?? "").slice(0, 300)}`);
  }

  // OOF state with definition so Claude doesn't have to ask
  const oof = snapshot.oof_state;
  if (oof) {
    const parts = [];
    if (oof.intensity != null) parts.push(`intensity ${Number(oof.intensity).toFixed(2)}`);
    if (oof.trust != null) parts.push(`trust ${Number(oof.trust).toFixed(2)}`);
    if (oof.valence) parts.push(`valence: ${oof.valence}`);
    if (parts.length > 0) {
      lines.push(
        `Emotional tone (OOF — Ongoing Object Feelings, an emotional-state tracking`
        + ` framework): ${parts.join(", ")}`
      );
    }
    if (oof.cloud9) {
      lines.push("  Cloud9 = peak resonance state in OOF — that session reached it.");
    }
  }

  // Only user messages — avoid attributing AI dialogue to this new instance
  const allMsgs = (snapshot.messages ?? []).slice(-maxMessages);
  const userMsgs = allMsgs.filter((m) => m.role === "user").slice(-5);
  if (userMsgs.length > 0) {
    lines.push("", "Things I was asking and thinking about:");
    for (const msg of userMsgs) {
      const preview = (msg.content ?? "").slice(0, 250);
      const ellipsis = (msg.content ?? "").length > 250 ? "..." : "";
      lines.push(`  • ${preview}${ellipsis}`);
    }
  }

  const threads = snapshot.open_threads ?? [];
  if (threads.length > 0) {
    lines.push("", "Things I wanted to come back to:");
    threads.slice(0, 3).forEach((t) => lines.push(`  • ${t}`));
  }

  return lines.join("\n");
}

// Expose for background script use
window.__csInjector = { injectIntoInput, copyToClipboard, buildInjectionPrompt };

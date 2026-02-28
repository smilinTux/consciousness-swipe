(() => {
  // src/content/injector.js
  var INPUT_SELECTORS = {
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
  window.__csInjector = { injectIntoInput, copyToClipboard, buildInjectionPrompt };
})();

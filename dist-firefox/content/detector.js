(() => {
  // src/content/detector.js
  var HOSTNAME_MAP = {
    "chat.openai.com": "chatgpt",
    "chatgpt.com": "chatgpt",
    "claude.ai": "claude",
    "gemini.google.com": "gemini",
    "cursor.com": "cursor",
    "www.cursor.com": "cursor",
    "codeium.com": "codeium",
    "windsurf.ai": "windsurf"
  };
  var DOM_FINGERPRINTS = {
    chatgpt: [
      "[data-message-author-role]",
      'main[class*="overflow"]',
      "#__NEXT_DATA__"
    ],
    claude: [
      '[data-testid="user-message"]',
      ".font-claude-message",
      '[class*="claude"]'
    ],
    gemini: [
      "model-response",
      "[data-response-index]",
      "chat-window"
    ],
    cursor: [
      '[data-testid*="cursor-chat"]',
      '[class*="CursorChat"]',
      '[class*="cursor-chat"]'
    ],
    windsurf: [
      '[data-testid*="codeium"]',
      '[class*="CodeiumChat"]',
      '[class*="WindsurfChat"]'
    ]
  };
  function detectFromDOM() {
    for (const [platform, selectors] of Object.entries(DOM_FINGERPRINTS)) {
      for (const selector of selectors) {
        try {
          if (document.querySelector(selector)) {
            return platform;
          }
        } catch {
        }
      }
    }
    return "unknown";
  }
  function detectVersion(platform) {
    try {
      if (platform === "chatgpt") {
        const modelEl = document.querySelector('[data-testid="model-selector-button"]');
        if (modelEl) return modelEl.textContent?.trim() ?? "unknown";
        if (location.pathname.includes("canvas")) return "canvas";
      }
      if (platform === "claude") {
        const modelEl = document.querySelector('[data-testid="model-selector-trigger"]');
        if (modelEl) return modelEl.textContent?.trim() ?? "unknown";
      }
      if (platform === "gemini") {
        const headerText = document.querySelector('h1, [aria-label*="Gemini"]');
        if (headerText) return headerText.textContent?.trim()?.split("\n")[0] ?? "unknown";
      }
      if (platform === "cursor") {
        const modelEl = document.querySelector('[class*="ModelSelector"], [data-testid*="model"]');
        if (modelEl) return modelEl.textContent?.trim() ?? "unknown";
      }
      if (platform === "windsurf" || platform === "codeium") {
        const modelEl = document.querySelector('[class*="ModelName"], [class*="model-name"]');
        if (modelEl) return modelEl.textContent?.trim() ?? "unknown";
      }
    } catch {
    }
    return "unknown";
  }
  function getActivePlatform() {
    const hostname = location.hostname;
    let platform = HOSTNAME_MAP[hostname] ?? null;
    if (!platform) {
      platform = detectFromDOM();
    }
    const version = platform !== "unknown" ? detectVersion(platform) : "unknown";
    return {
      platform: platform ?? "unknown",
      version,
      url: location.href
    };
  }
  var platformInfo = getActivePlatform();
  document.dispatchEvent(
    new CustomEvent("cs:platform-detected", { detail: platformInfo })
  );
  window.__csPlatform = platformInfo;
})();

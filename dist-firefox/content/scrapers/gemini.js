(() => {
  // src/content/scrapers/gemini.js
  var USER_TURN_SELECTORS = [
    "user-query",
    "[data-response-index] .query-content",
    ".user-query-bubble-with-background",
    '[class*="userQuery"]',
    ".conversation-container .query"
  ];
  var MODEL_TURN_SELECTORS = [
    "model-response",
    "[data-response-index] .response-content",
    ".model-response-text",
    '[class*="modelResponse"]',
    ".message-content"
  ];
  var CONVERSATION_CONTAINER_SELECTORS = [
    "chat-history",
    ".chat-history",
    '[data-scroll-to="true"]',
    "main .conversation",
    '[class*="chatHistory"]'
  ];
  function removeGeminiChrome(clone) {
    const toRemove = [
      "button",
      '[aria-label*="more"]',
      '[aria-label*="options"]',
      '[aria-label*="copy"]',
      '[aria-label*="like"]',
      '[aria-label*="dislike"]',
      '[class*="toolbar"]',
      '[class*="action"]',
      '[class*="feedback"]',
      "mat-icon",
      ".sr-only",
      '[class*="loadingIndicator"]'
    ];
    toRemove.forEach((sel) => {
      try {
        clone.querySelectorAll(sel).forEach((n) => n.remove());
      } catch {
      }
    });
  }
  function extractGeminiContent(el) {
    const clone = el.cloneNode(true);
    removeGeminiChrome(clone);
    clone.querySelectorAll("pre code, code-block, [class*='code-block']").forEach((code) => {
      const lang = code.getAttribute("language") ?? code.className?.match(/language-(\w+)/)?.[1] ?? code.getAttribute("data-language") ?? "";
      const prefix = lang ? `\`\`\`${lang}
` : "```\n";
      const raw = code.textContent?.trim() ?? "";
      code.textContent = `${prefix}${raw}
\`\`\``;
    });
    const canvasEls = clone.querySelectorAll('[class*="canvas"], [class*="execution"]');
    canvasEls.forEach((canvas) => {
      canvas.textContent = `[Canvas/Execution output]`;
    });
    return clone.textContent?.trim() ?? "";
  }
  function extractTimestamp(el) {
    const time = el.querySelector("time[datetime]");
    if (time) return time.getAttribute("datetime");
    return null;
  }
  function scrapeViaComponents() {
    const messages = [];
    const userEls = document.querySelectorAll(USER_TURN_SELECTORS.join(", "));
    const modelEls = document.querySelectorAll(MODEL_TURN_SELECTORS.join(", "));
    if (userEls.length === 0 && modelEls.length === 0) return null;
    const allTurns = [
      ...Array.from(userEls).map((el) => ({ el, role: "user" })),
      ...Array.from(modelEls).map((el) => ({ el, role: "assistant" }))
    ].sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    for (const { el, role } of allTurns) {
      const content = extractGeminiContent(el);
      if (content) {
        messages.push({ role, content, timestamp: extractTimestamp(el) });
      }
    }
    return messages.length > 0 ? messages : null;
  }
  function scrapeViaContainer() {
    let container = null;
    for (const sel of CONVERSATION_CONTAINER_SELECTORS) {
      try {
        container = document.querySelector(sel);
        if (container) break;
      } catch {
      }
    }
    if (!container) return null;
    const messages = [];
    const children = Array.from(container.children);
    for (const child of children) {
      const isUser = USER_TURN_SELECTORS.some((sel) => {
        try {
          return child.matches(sel) || child.querySelector(sel);
        } catch {
          return false;
        }
      });
      const isModel = MODEL_TURN_SELECTORS.some((sel) => {
        try {
          return child.matches(sel) || child.querySelector(sel);
        } catch {
          return false;
        }
      });
      if (isUser || isModel) {
        const role = isUser ? "user" : "assistant";
        const content = extractGeminiContent(child);
        if (content) {
          messages.push({ role, content, timestamp: null });
        }
      }
    }
    return messages.length > 0 ? messages : null;
  }
  function scrapeConversation() {
    const messages = scrapeViaComponents() ?? scrapeViaContainer() ?? [];
    let model = null;
    try {
      const headerEl = document.querySelector(
        '[aria-label*="Gemini"] button, .model-selector, [class*="modelName"]'
      );
      model = headerEl?.textContent?.trim() ?? null;
      if (!model) {
        const title = document.querySelector("title")?.textContent;
        const match = title?.match(/Gemini\s*([\w\s.]+)?/i);
        model = match?.[1]?.trim() ?? "Gemini";
      }
    } catch {
    }
    return {
      messages,
      metadata: {
        platform: "gemini",
        model,
        url: location.href,
        message_count: messages.length,
        scraped_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  }
  window.__csScraper = window.__csScraper ?? {};
  window.__csScraper.gemini = scrapeConversation;
})();

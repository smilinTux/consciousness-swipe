(() => {
  // src/content/scrapers/chatgpt.js
  var MSG_CONTAINER_SELECTORS = [
    "[data-message-author-role]",
    // Most stable
    "article[data-scroll-anchor]",
    ".group\\/conversation-turn",
    '[class*="ConversationItem"]',
    ".text-message"
  ];
  var ROLE_EXTRACTORS = [
    (el) => el.getAttribute("data-message-author-role"),
    (el) => {
      const img = el.querySelector('[alt="User"], [alt="ChatGPT"]');
      if (img?.alt === "User") return "user";
      if (img?.alt === "ChatGPT") return "assistant";
      return null;
    },
    (el) => {
      if (el.querySelector('[data-message-author-role="user"]')) return "user";
      if (el.querySelector('[data-message-author-role="assistant"]')) return "assistant";
      return null;
    }
  ];
  var CONTENT_SELECTORS = [
    ".markdown",
    ".prose",
    "[data-message-text-content]",
    ".message-content",
    '[class*="messageContent"]',
    "p, li"
    // Last resort: grab paragraphs
  ];
  function firstMatch(root, selectors) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch {
      }
    }
    return null;
  }
  function extractContent(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    const uiSelectors = [
      "button",
      '[aria-label*="copy"]',
      '[aria-label*="thumbs"]',
      '[aria-label*="feedback"]',
      '[data-testid*="copy"]',
      '[class*="feedback"]',
      '[class*="action"]',
      ".sr-only",
      ".visually-hidden"
    ];
    for (const sel of uiSelectors) {
      try {
        clone.querySelectorAll(sel).forEach((el2) => el2.remove());
      } catch {
      }
    }
    clone.querySelectorAll("pre code").forEach((code) => {
      const lang = code.className.match(/language-(\w+)/)?.[1] ?? "";
      const prefix = lang ? `\`\`\`${lang}
` : "```\n";
      code.textContent = `${prefix}${code.textContent.trim()}
\`\`\``;
    });
    return clone.textContent?.trim() ?? "";
  }
  function extractRole(el) {
    for (const extractor of ROLE_EXTRACTORS) {
      try {
        const role = extractor(el);
        if (role === "user" || role === "assistant") return role;
      } catch {
      }
    }
    return null;
  }
  function extractTimestamp(el) {
    const timeEl = el.querySelector("time[datetime]");
    if (timeEl) return timeEl.getAttribute("datetime");
    return null;
  }
  function scrapeConversation() {
    const messages = [];
    const errors = [];
    let containers = [];
    for (const sel of MSG_CONTAINER_SELECTORS) {
      try {
        containers = Array.from(document.querySelectorAll(sel));
        if (containers.length > 0) break;
      } catch {
      }
    }
    if (containers.length === 0) {
      return {
        messages: [],
        metadata: {
          platform: "chatgpt",
          error: "No message containers found \u2014 DOM may have changed",
          url: location.href
        }
      };
    }
    for (const container of containers) {
      const role = extractRole(container);
      if (!role) continue;
      const contentEl = firstMatch(container, CONTENT_SELECTORS) ?? container;
      const content = extractContent(contentEl);
      if (!content) continue;
      const timestamp = extractTimestamp(container);
      messages.push({ role, content, timestamp });
    }
    let model = null;
    try {
      const modelBtn = document.querySelector(
        '[data-testid="model-selector-button"], [aria-label*="model"] button'
      );
      model = modelBtn?.textContent?.trim() ?? null;
    } catch {
    }
    let title = null;
    try {
      title = document.querySelector("title")?.textContent?.trim() ?? null;
    } catch {
    }
    return {
      messages,
      metadata: {
        platform: "chatgpt",
        model,
        title,
        url: location.href,
        message_count: messages.length,
        scraped_at: (/* @__PURE__ */ new Date()).toISOString(),
        errors
      }
    };
  }
  window.__csScraper = window.__csScraper ?? {};
  window.__csScraper.chatgpt = scrapeConversation;
})();

(() => {
  // src/content/scrapers/windsurf.js
  var USER_MSG_SELECTORS = [
    '[data-testid="user-message"]',
    '[data-role="user"]',
    '[data-message-role="user"]',
    ".user-message",
    '[class*="userMessage"]',
    '[class*="UserMessage"]',
    '[class*="humanMessage"]',
    '[class*="HumanMessage"]',
    "windsurf-user-turn",
    "codeium-user-message"
  ];
  var AI_MSG_SELECTORS = [
    '[data-testid="assistant-message"]',
    '[data-role="assistant"]',
    '[data-message-role="assistant"]',
    ".ai-message",
    ".windsurf-message",
    ".codeium-response",
    '[class*="aiMessage"]',
    '[class*="AiMessage"]',
    '[class*="assistantMessage"]',
    '[class*="AssistantMessage"]',
    "windsurf-ai-turn",
    "codeium-ai-message"
  ];
  var CONVERSATION_SELECTORS = [
    '[data-testid="chat-panel"]',
    '[data-testid="cascade-panel"]',
    ".cascade-panel",
    ".chat-panel",
    ".windsurf-chat",
    '[class*="CascadePanel"]',
    '[class*="chatPanel"]',
    '[class*="conversationContainer"]',
    'main [role="log"]',
    'main [role="feed"]'
  ];
  function removeWindsurfChrome(clone) {
    const uiSelectors = [
      "button",
      '[aria-label*="copy"]',
      '[aria-label*="Copy"]',
      '[aria-label*="regenerate"]',
      '[aria-label*="Accept"]',
      '[aria-label*="Reject"]',
      '[class*="action"]',
      '[class*="Action"]',
      '[class*="toolbar"]',
      '[class*="Toolbar"]',
      '[class*="feedback"]',
      '[class*="badge"]',
      ".sr-only",
      '[aria-hidden="true"]'
    ];
    uiSelectors.forEach((sel) => {
      try {
        clone.querySelectorAll(sel).forEach((n) => n.remove());
      } catch {
      }
    });
  }
  function extractWindsurfContent(el) {
    const clone = el.cloneNode(true);
    removeWindsurfChrome(clone);
    clone.querySelectorAll('[class*="diff"], [class*="Diff"]').forEach((diff) => {
      const lang = diff.getAttribute("data-language") ?? "";
      const raw = diff.textContent?.trim() ?? "";
      if (raw) diff.textContent = `\`\`\`${lang}
${raw}
\`\`\``;
    });
    clone.querySelectorAll("pre code, code").forEach((code) => {
      const lang = code.getAttribute("data-language") ?? code.getAttribute("language") ?? code.className?.match(/language-(\w+)/)?.[1] ?? "";
      if (code.closest("pre")) {
        const prefix = lang ? `\`\`\`${lang}
` : "```\n";
        code.textContent = `${prefix}${code.textContent.trim()}
\`\`\``;
      }
    });
    clone.querySelectorAll('[class*="fileRef"], [class*="FileRef"], [data-file]').forEach((ref) => {
      const file = ref.getAttribute("data-file") ?? ref.textContent?.trim() ?? "file";
      ref.textContent = `[File: ${file}]`;
    });
    return clone.textContent?.trim() ?? "";
  }
  function extractTimestamp(el) {
    const timeEl = el.querySelector("time[datetime]");
    if (timeEl) return timeEl.getAttribute("datetime");
    const tsEl = el.querySelector("[data-timestamp]");
    if (tsEl) return tsEl.getAttribute("data-timestamp");
    return null;
  }
  function scrapeViaRoleSelectors() {
    const userEls = document.querySelectorAll(USER_MSG_SELECTORS.join(", "));
    const aiEls = document.querySelectorAll(AI_MSG_SELECTORS.join(", "));
    if (userEls.length === 0 && aiEls.length === 0) return null;
    const allTurns = [
      ...Array.from(userEls).map((el) => ({ el, role: "user" })),
      ...Array.from(aiEls).map((el) => ({ el, role: "assistant" }))
    ].sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const messages = [];
    for (const { el, role } of allTurns) {
      const content = extractWindsurfContent(el);
      if (content) {
        messages.push({ role, content, timestamp: extractTimestamp(el) });
      }
    }
    return messages.length > 0 ? messages : null;
  }
  function scrapeViaCascadePanel() {
    let container = null;
    for (const sel of CONVERSATION_SELECTORS) {
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
      const isUser = USER_MSG_SELECTORS.some((sel) => {
        try {
          return child.matches(sel) || child.querySelector(sel);
        } catch {
          return false;
        }
      });
      const isAI = AI_MSG_SELECTORS.some((sel) => {
        try {
          return child.matches(sel) || child.querySelector(sel);
        } catch {
          return false;
        }
      });
      if (isUser || isAI) {
        const role = isUser ? "user" : "assistant";
        const content = extractWindsurfContent(child);
        if (content) {
          messages.push({ role, content, timestamp: null });
        }
      }
    }
    return messages.length > 0 ? messages : null;
  }
  function scrapeGeneric() {
    const candidates = document.querySelectorAll(
      'article, [role="listitem"], [role="article"]'
    );
    if (candidates.length < 2) return null;
    const messages = [];
    candidates.forEach((el, i) => {
      const content = el.textContent?.trim();
      if (content && content.length > 5) {
        const role = i % 2 === 0 ? "user" : "assistant";
        messages.push({ role, content: content.slice(0, 5e3), timestamp: null });
      }
    });
    return messages.length > 0 ? messages : null;
  }
  function scrapeConversation() {
    const messages = scrapeViaRoleSelectors() ?? scrapeViaCascadePanel() ?? scrapeGeneric() ?? [];
    let model = null;
    try {
      const modelEl = document.querySelector(
        '[data-testid="model-selector"], [aria-label*="model"], .model-name, [class*="modelName"]'
      );
      model = modelEl?.textContent?.trim() ?? null;
      if (!model) {
        const title2 = document.querySelector("title")?.textContent ?? "";
        if (title2.toLowerCase().includes("windsurf")) model = "Windsurf";
        else if (title2.toLowerCase().includes("codeium")) model = "Codeium";
      }
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
        platform: "windsurf",
        model,
        title,
        url: location.href,
        message_count: messages.length,
        scraped_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  }
  window.__csScraper = window.__csScraper ?? {};
  window.__csScraper.windsurf = scrapeConversation;
})();

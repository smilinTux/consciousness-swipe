(() => {
  // src/content/scrapers/cursor.js
  var USER_MSG_SELECTORS = [
    '[data-testid="user-message"]',
    '[data-role="user"]',
    ".user-message",
    '[class*="userMessage"]',
    '[class*="UserMessage"]',
    '[class*="human-message"]',
    '[class*="HumanMessage"]'
  ];
  var AI_MSG_SELECTORS = [
    '[data-testid="assistant-message"]',
    '[data-role="assistant"]',
    ".ai-message",
    ".cursor-message",
    '[class*="aiMessage"]',
    '[class*="AiMessage"]',
    '[class*="assistantMessage"]',
    '[class*="AssistantMessage"]',
    '[class*="bot-message"]'
  ];
  var CONVERSATION_SELECTORS = [
    '[data-testid="chat-history"]',
    ".chat-history",
    ".conversation",
    '[class*="chatHistory"]',
    '[class*="ChatHistory"]',
    '[class*="messageList"]',
    '[class*="MessageList"]',
    'main [role="log"]'
  ];
  function removeCursorChrome(clone) {
    const uiSelectors = [
      "button",
      '[aria-label*="copy"]',
      '[aria-label*="Copy"]',
      '[aria-label*="regenerate"]',
      '[aria-label*="thumbs"]',
      '[class*="action"]',
      '[class*="Action"]',
      '[class*="toolbar"]',
      '[class*="Toolbar"]',
      '[class*="feedback"]',
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
  function extractCursorContent(el) {
    const clone = el.cloneNode(true);
    removeCursorChrome(clone);
    clone.querySelectorAll(".monaco-editor").forEach((monaco) => {
      const code = monaco.textContent?.trim();
      if (code) monaco.textContent = `\`\`\`
${code}
\`\`\``;
    });
    clone.querySelectorAll("pre code, code").forEach((code) => {
      const lang = code.getAttribute("data-language") ?? code.className?.match(/language-(\w+)/)?.[1] ?? "";
      if (code.closest("pre")) {
        const prefix = lang ? `\`\`\`${lang}
` : "```\n";
        code.textContent = `${prefix}${code.textContent.trim()}
\`\`\``;
      }
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
    const messages = [];
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
    for (const { el, role } of allTurns) {
      const content = extractCursorContent(el);
      if (content) {
        messages.push({ role, content, timestamp: extractTimestamp(el) });
      }
    }
    return messages.length > 0 ? messages : null;
  }
  function scrapeViaContainer() {
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
        const content = extractCursorContent(isUser || isAI ? child : child);
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
    const messages = scrapeViaRoleSelectors() ?? scrapeViaContainer() ?? scrapeGeneric() ?? [];
    let model = null;
    try {
      const modelEl = document.querySelector(
        '[data-testid="model-selector"], [aria-label*="model"] button, .model-name, [class*="modelName"]'
      );
      model = modelEl?.textContent?.trim() ?? null;
      if (!model) {
        const title2 = document.querySelector("title")?.textContent;
        if (title2?.toLowerCase().includes("cursor")) model = "Cursor AI";
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
        platform: "cursor",
        model,
        title,
        url: location.href,
        message_count: messages.length,
        scraped_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  }
  window.__csScraper = window.__csScraper ?? {};
  window.__csScraper.cursor = scrapeConversation;
})();

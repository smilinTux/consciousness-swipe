(() => {
  // src/content/scrapers/claude.js
  var CONVERSATION_SELECTORS = [
    '[data-testid="conversation-turn"]',
    ".conversation-content",
    'main [class*="conversation"]'
  ];
  var CLAUDE_MSG_SELECTORS = [
    ".font-claude-message",
    '[data-testid="assistant-message"]',
    '[class*="AssistantMessage"]'
  ];
  var HUMAN_MSG_SELECTORS = [
    '[data-testid="user-message"]',
    ".human-turn",
    '[class*="HumanMessage"]'
  ];
  function extractThinkingBlock(el) {
    const isThinking = el.getAttribute("data-testid")?.includes("thinking") || el.className?.includes("thinking") || el.querySelector('[aria-label*="thinking"], [aria-label*="Thinking"]');
    if (!isThinking) return null;
    const previewEl = el.querySelector('[class*="preview"], summary, [class*="collapsed"]');
    if (previewEl) {
      return `[Thinking: ${previewEl.textContent?.trim()?.slice(0, 100)}...]`;
    }
    return "[Thinking: ...]";
  }
  function extractArtifacts(el) {
    const refs = [];
    try {
      el.querySelectorAll('[data-testid*="artifact"], [class*="artifact"], [class*="Artifact"]').forEach((artifact) => {
        const title = artifact.querySelector('[class*="title"], h3, h4');
        const lang = artifact.querySelector('[class*="language"], [class*="lang"]');
        const desc = [
          title?.textContent?.trim() ?? "Artifact",
          lang?.textContent?.trim() ? `(${lang.textContent.trim()})` : ""
        ].filter(Boolean).join(" ");
        refs.push(`[Artifact: ${desc}]`);
      });
    } catch {
    }
    return refs;
  }
  function extractClaudeContent(el) {
    const clone = el.cloneNode(true);
    [
      "button",
      '[class*="actions"]',
      '[class*="feedback"]',
      '[aria-label*="copy"]',
      '[aria-label*="regenerate"]',
      ".sr-only"
    ].forEach((sel) => {
      try {
        clone.querySelectorAll(sel).forEach((n) => n.remove());
      } catch {
      }
    });
    clone.querySelectorAll("pre code, code").forEach((code) => {
      const lang = code.className?.match(/language-(\w+)/)?.[1] ?? "";
      if (code.closest("pre")) {
        const prefix = lang ? `\`\`\`${lang}
` : "```\n";
        code.textContent = `${prefix}${code.textContent.trim()}
\`\`\``;
      }
    });
    return clone.textContent?.trim() ?? "";
  }
  function collectMessages() {
    const messages = [];
    for (const humanSel of HUMAN_MSG_SELECTORS) {
      const humanEls = document.querySelectorAll(humanSel);
      if (humanEls.length === 0) continue;
      humanEls.forEach((humanEl) => {
        const humanContent = extractClaudeContent(humanEl);
        if (humanContent) {
          messages.push({ role: "user", content: humanContent, timestamp: null });
        }
        let next = humanEl.nextElementSibling;
        while (next) {
          const isAssistant = next.matches(CLAUDE_MSG_SELECTORS.join(", ")) || next.querySelector(CLAUDE_MSG_SELECTORS.join(", "));
          if (isAssistant) {
            const thinkingEl = next.querySelector('[data-testid*="thinking"]');
            let content = "";
            if (thinkingEl) {
              content += extractThinkingBlock(thinkingEl) + "\n\n";
            }
            content += extractClaudeContent(next);
            const artifacts = extractArtifacts(next);
            if (artifacts.length > 0) {
              content += "\n" + artifacts.join("\n");
            }
            if (content.trim()) {
              messages.push({ role: "assistant", content: content.trim(), timestamp: null });
            }
            break;
          }
          if (next.matches(HUMAN_MSG_SELECTORS.join(", "))) break;
          next = next.nextElementSibling;
        }
      });
      if (messages.length > 0) break;
    }
    if (messages.length === 0) {
      for (const sel of CONVERSATION_SELECTORS) {
        const turns = document.querySelectorAll(sel);
        if (turns.length === 0) continue;
        turns.forEach((turn) => {
          const isHuman = turn.matches(HUMAN_MSG_SELECTORS.join(", ")) || turn.querySelector(HUMAN_MSG_SELECTORS.join(", "));
          const role = isHuman ? "user" : "assistant";
          const content = extractClaudeContent(turn);
          if (content) {
            messages.push({ role, content, timestamp: null });
          }
        });
        break;
      }
    }
    return messages;
  }
  function scrapeConversation() {
    const messages = collectMessages();
    let model = null;
    try {
      const modelEl = document.querySelector(
        '[data-testid="model-selector-trigger"], [aria-label*="Claude"] button'
      );
      model = modelEl?.textContent?.trim() ?? null;
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
        platform: "claude",
        model,
        title,
        url: location.href,
        message_count: messages.length,
        scraped_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  }
  window.__csScraper = window.__csScraper ?? {};
  window.__csScraper.claude = scrapeConversation;
})();

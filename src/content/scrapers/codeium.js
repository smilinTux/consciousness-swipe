/**
 * Codeium AI DOM scraper for codeium.com.
 *
 * Codeium.com is the web chat interface for the Codeium/Cascade AI engine —
 * the same engine powering Windsurf IDE. This scraper targets the web app.
 * Uses multiple selector strategies with graceful fallback — returns empty
 * messages array if the current DOM doesn't match.
 *
 * DOM shape: React/Lit-rendered web components, class names vary.
 * Stable anchors: data-* attributes, ARIA roles, semantic tags.
 *
 * Last verified against: codeium.com (Feb 2026)
 *
 * @module scrapers/codeium
 */

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** User / human message containers */
const USER_MSG_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-role="user"]',
  '[data-message-role="user"]',
  '.user-message',
  '[class*="userMessage"]',
  '[class*="UserMessage"]',
  '[class*="humanMessage"]',
  '[class*="HumanMessage"]',
  'codeium-user-turn',
  'codeium-user-message',
];

/** Codeium AI response containers */
const AI_MSG_SELECTORS = [
  '[data-testid="assistant-message"]',
  '[data-role="assistant"]',
  '[data-message-role="assistant"]',
  '.ai-message',
  '.codeium-message',
  '.codeium-response',
  '[class*="aiMessage"]',
  '[class*="AiMessage"]',
  '[class*="assistantMessage"]',
  '[class*="AssistantMessage"]',
  '[class*="CodeiumMessage"]',
  'codeium-ai-turn',
  'codeium-ai-message',
];

/** Conversation wrapper / chat panel selectors */
const CONVERSATION_SELECTORS = [
  '[data-testid="chat-panel"]',
  '[data-testid="codeium-chat"]',
  '[data-testid="cascade-panel"]',
  '.cascade-panel',
  '.chat-panel',
  '.codeium-chat',
  '[class*="CodeiumChat"]',
  '[class*="CascadePanel"]',
  '[class*="chatPanel"]',
  '[class*="conversationContainer"]',
  'main [role="log"]',
  'main [role="feed"]',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove Codeium UI chrome from a cloned element.
 *
 * @param {Element} clone
 */
function removeCodeiumChrome(clone) {
  const uiSelectors = [
    'button',
    '[aria-label*="copy"]',
    '[aria-label*="Copy"]',
    '[aria-label*="regenerate"]',
    '[aria-label*="Accept"]',
    '[aria-label*="Reject"]',
    '[aria-label*="thumbs"]',
    '[class*="action"]',
    '[class*="Action"]',
    '[class*="toolbar"]',
    '[class*="Toolbar"]',
    '[class*="feedback"]',
    '[class*="badge"]',
    '.sr-only',
    '[aria-hidden="true"]',
  ];
  uiSelectors.forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch { /* skip */ }
  });
}

/**
 * Extract clean text from a Codeium message element.
 * Handles Cascade AI's code diff blocks and inline suggestions.
 *
 * @param {Element} el
 * @returns {string}
 */
function extractCodeiumContent(el) {
  const clone = el.cloneNode(true);
  removeCodeiumChrome(clone);

  // Handle code diff blocks (Codeium Cascade shows diffs inline)
  clone.querySelectorAll('[class*="diff"], [class*="Diff"]').forEach((diff) => {
    const lang = diff.getAttribute('data-language') ?? '';
    const raw = diff.textContent?.trim() ?? '';
    if (raw) diff.textContent = `\`\`\`${lang}\n${raw}\n\`\`\``;
  });

  // Annotate fenced code blocks
  clone.querySelectorAll('pre code, code').forEach((code) => {
    const lang = (
      code.getAttribute('data-language') ??
      code.getAttribute('language') ??
      code.className?.match(/language-(\w+)/)?.[1] ??
      ''
    );
    if (code.closest('pre')) {
      const prefix = lang ? `\`\`\`${lang}\n` : '```\n';
      code.textContent = `${prefix}${code.textContent.trim()}\n\`\`\``;
    }
  });

  // Replace inline file references with descriptive text
  clone.querySelectorAll('[class*="fileRef"], [class*="FileRef"], [data-file]').forEach((ref) => {
    const file = ref.getAttribute('data-file') ?? ref.textContent?.trim() ?? 'file';
    ref.textContent = `[File: ${file}]`;
  });

  return clone.textContent?.trim() ?? '';
}

/**
 * Extract a timestamp if available.
 *
 * @param {Element} el
 * @returns {string|null}
 */
function extractTimestamp(el) {
  const timeEl = el.querySelector('time[datetime]');
  if (timeEl) return timeEl.getAttribute('datetime');
  const tsEl = el.querySelector('[data-timestamp]');
  if (tsEl) return tsEl.getAttribute('data-timestamp');
  return null;
}

// ---------------------------------------------------------------------------
// Scraping strategies
// ---------------------------------------------------------------------------

/**
 * Strategy 1: Use explicit role-based selectors (most reliable).
 *
 * @returns {Array<{role: string, content: string, timestamp: string|null}>|null}
 */
function scrapeViaRoleSelectors() {
  const userEls = document.querySelectorAll(USER_MSG_SELECTORS.join(', '));
  const aiEls = document.querySelectorAll(AI_MSG_SELECTORS.join(', '));

  if (userEls.length === 0 && aiEls.length === 0) return null;

  const allTurns = [
    ...Array.from(userEls).map((el) => ({ el, role: 'user' })),
    ...Array.from(aiEls).map((el) => ({ el, role: 'assistant' })),
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const messages = [];
  for (const { el, role } of allTurns) {
    const content = extractCodeiumContent(el);
    if (content) {
      messages.push({ role, content, timestamp: extractTimestamp(el) });
    }
  }

  return messages.length > 0 ? messages : null;
}

/**
 * Strategy 2: Walk the Codeium chat panel container.
 *
 * @returns {Array|null}
 */
function scrapeViaChatPanel() {
  let container = null;
  for (const sel of CONVERSATION_SELECTORS) {
    try {
      container = document.querySelector(sel);
      if (container) break;
    } catch { /* skip */ }
  }
  if (!container) return null;

  const messages = [];
  const children = Array.from(container.children);

  for (const child of children) {
    const isUser = USER_MSG_SELECTORS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });
    const isAI = AI_MSG_SELECTORS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });

    if (isUser || isAI) {
      const role = isUser ? 'user' : 'assistant';
      const content = extractCodeiumContent(child);
      if (content) {
        messages.push({ role, content, timestamp: null });
      }
    }
  }

  return messages.length > 0 ? messages : null;
}

/**
 * Strategy 3: Generic article/listitem fallback.
 *
 * @returns {Array|null}
 */
function scrapeGeneric() {
  const candidates = document.querySelectorAll(
    'article, [role="listitem"], [role="article"]'
  );
  if (candidates.length < 2) return null;

  const messages = [];
  candidates.forEach((el, i) => {
    const content = el.textContent?.trim();
    if (content && content.length > 5) {
      const role = i % 2 === 0 ? 'user' : 'assistant';
      messages.push({ role, content: content.slice(0, 5000), timestamp: null });
    }
  });

  return messages.length > 0 ? messages : null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scrape the full conversation from a Codeium tab.
 *
 * @returns {{messages: Array, metadata: Object}}
 */
function scrapeConversation() {
  const messages =
    scrapeViaRoleSelectors() ??
    scrapeViaChatPanel() ??
    scrapeGeneric() ??
    [];

  // Detect model / variant
  let model = null;
  try {
    const modelEl = document.querySelector(
      '[data-testid="model-selector"], [aria-label*="model"], .model-name, [class*="modelName"], [class*="ModelName"]'
    );
    model = modelEl?.textContent?.trim() ?? null;
    if (!model) {
      const title = document.querySelector('title')?.textContent ?? '';
      if (title.toLowerCase().includes('codeium')) model = 'Codeium';
      else if (title.toLowerCase().includes('windsurf')) model = 'Windsurf';
    }
  } catch { /* skip */ }

  let title = null;
  try {
    title = document.querySelector('title')?.textContent?.trim() ?? null;
  } catch { /* skip */ }

  return {
    messages,
    metadata: {
      platform: 'codeium',
      model,
      title,
      url: location.href,
      message_count: messages.length,
      scraped_at: new Date().toISOString(),
    },
  };
}

window.__csScraper = window.__csScraper ?? {};
window.__csScraper.codeium = scrapeConversation;

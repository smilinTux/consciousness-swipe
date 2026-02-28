/**
 * Cursor AI DOM scraper for cursor.com.
 *
 * Cursor is a VS Code-based AI IDE. This scraper targets the Cursor web
 * interface and companion app's exported chat views. Uses multiple selector
 * strategies with graceful fallback — returns empty messages array if the
 * current DOM doesn't match any known pattern.
 *
 * DOM shape: React-rendered, class names may include hashed suffixes.
 * Stable anchors: data-testid attributes, ARIA roles, semantic tags.
 *
 * Last verified against: cursor.com (Feb 2026)
 *
 * @module scrapers/cursor
 */

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** User message containers */
const USER_MSG_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-role="user"]',
  '.user-message',
  '[class*="userMessage"]',
  '[class*="UserMessage"]',
  '[class*="human-message"]',
  '[class*="HumanMessage"]',
];

/** AI / assistant message containers */
const AI_MSG_SELECTORS = [
  '[data-testid="assistant-message"]',
  '[data-role="assistant"]',
  '.ai-message',
  '.cursor-message',
  '[class*="aiMessage"]',
  '[class*="AiMessage"]',
  '[class*="assistantMessage"]',
  '[class*="AssistantMessage"]',
  '[class*="bot-message"]',
];

/** Conversation / chat history wrappers */
const CONVERSATION_SELECTORS = [
  '[data-testid="chat-history"]',
  '.chat-history',
  '.conversation',
  '[class*="chatHistory"]',
  '[class*="ChatHistory"]',
  '[class*="messageList"]',
  '[class*="MessageList"]',
  'main [role="log"]',
];

/** Code block language selectors (VS Code-style) */
const CODE_LANG_SELECTORS = [
  '[class*="language-"]',
  '[data-language]',
  '.monaco-editor',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove Cursor UI chrome (action buttons, copy icons, etc.) from a clone.
 *
 * @param {Element} clone
 */
function removeCursorChrome(clone) {
  const uiSelectors = [
    'button',
    '[aria-label*="copy"]',
    '[aria-label*="Copy"]',
    '[aria-label*="regenerate"]',
    '[aria-label*="thumbs"]',
    '[class*="action"]',
    '[class*="Action"]',
    '[class*="toolbar"]',
    '[class*="Toolbar"]',
    '[class*="feedback"]',
    '.sr-only',
    '[aria-hidden="true"]',
  ];
  uiSelectors.forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch { /* skip */ }
  });
}

/**
 * Extract clean text from a Cursor message element.
 * Handles Monaco editor code blocks and VS Code markdown rendering.
 *
 * @param {Element} el
 * @returns {string}
 */
function extractCursorContent(el) {
  const clone = el.cloneNode(true);
  removeCursorChrome(clone);

  // Handle Monaco editor code references
  clone.querySelectorAll('.monaco-editor').forEach((monaco) => {
    const code = monaco.textContent?.trim();
    if (code) monaco.textContent = `\`\`\`\n${code}\n\`\`\``;
  });

  // Annotate fenced code blocks
  clone.querySelectorAll('pre code, code').forEach((code) => {
    const lang = (
      code.getAttribute('data-language') ??
      code.className?.match(/language-(\w+)/)?.[1] ??
      ''
    );
    if (code.closest('pre')) {
      const prefix = lang ? `\`\`\`${lang}\n` : '```\n';
      code.textContent = `${prefix}${code.textContent.trim()}\n\`\`\``;
    }
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
 * Strategy 1: Look for explicit user/AI message containers.
 *
 * @returns {Array<{role: string, content: string, timestamp: string|null}>|null}
 */
function scrapeViaRoleSelectors() {
  const messages = [];

  const userEls = document.querySelectorAll(USER_MSG_SELECTORS.join(', '));
  const aiEls = document.querySelectorAll(AI_MSG_SELECTORS.join(', '));

  if (userEls.length === 0 && aiEls.length === 0) return null;

  // Merge and sort by DOM order
  const allTurns = [
    ...Array.from(userEls).map((el) => ({ el, role: 'user' })),
    ...Array.from(aiEls).map((el) => ({ el, role: 'assistant' })),
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

/**
 * Strategy 2: Walk the conversation container for alternating turns.
 *
 * @returns {Array|null}
 */
function scrapeViaContainer() {
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
      const content = extractCursorContent(isUser || isAI ? child : child);
      if (content) {
        messages.push({ role, content, timestamp: null });
      }
    }
  }

  return messages.length > 0 ? messages : null;
}

/**
 * Strategy 3: Generic text extraction from any visible chat-like structure.
 * Last resort — grabs all meaningful text blocks from the page.
 *
 * @returns {Array|null}
 */
function scrapeGeneric() {
  // Look for any role="listitem" or article elements with message-like content
  const candidates = document.querySelectorAll(
    'article, [role="listitem"], [role="article"]'
  );
  if (candidates.length < 2) return null;

  const messages = [];
  candidates.forEach((el, i) => {
    const content = el.textContent?.trim();
    if (content && content.length > 5) {
      // Alternate user/assistant as best guess if no role info
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
 * Scrape the full conversation from a Cursor tab.
 *
 * @returns {{messages: Array, metadata: Object}}
 */
function scrapeConversation() {
  const messages =
    scrapeViaRoleSelectors() ??
    scrapeViaContainer() ??
    scrapeGeneric() ??
    [];

  // Detect AI model name
  let model = null;
  try {
    const modelEl = document.querySelector(
      '[data-testid="model-selector"], [aria-label*="model"] button, .model-name, [class*="modelName"]'
    );
    model = modelEl?.textContent?.trim() ?? null;
    if (!model) {
      // Try page title
      const title = document.querySelector('title')?.textContent;
      if (title?.toLowerCase().includes('cursor')) model = 'Cursor AI';
    }
  } catch { /* skip */ }

  let title = null;
  try {
    title = document.querySelector('title')?.textContent?.trim() ?? null;
  } catch { /* skip */ }

  return {
    messages,
    metadata: {
      platform: 'cursor',
      model,
      title,
      url: location.href,
      message_count: messages.length,
      scraped_at: new Date().toISOString(),
    },
  };
}

window.__csScraper = window.__csScraper ?? {};
window.__csScraper.cursor = scrapeConversation;

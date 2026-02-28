/**
 * ChatGPT DOM scraper for chat.openai.com / chatgpt.com.
 *
 * ChatGPT's DOM is a moving target — this scraper uses multiple
 * selector fallbacks in priority order so it keeps working after
 * minor UI updates. If the primary selector fails, we try the next.
 *
 * Last verified against: ChatGPT web UI (Feb 2026, GPT-4o)
 *
 * @module scrapers/chatgpt
 */

// ---------------------------------------------------------------------------
// Selector fallbacks (ordered by reliability, most stable first)
// ---------------------------------------------------------------------------

/** Message container selectors — tries each in order */
const MSG_CONTAINER_SELECTORS = [
  '[data-message-author-role]',                      // Most stable
  'article[data-scroll-anchor]',
  '.group\\/conversation-turn',
  '[class*="ConversationItem"]',
  '.text-message',
];

/** Role attribute/element for a message node */
const ROLE_EXTRACTORS = [
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
  },
];

/** Content extraction selectors within a message node */
const CONTENT_SELECTORS = [
  '.markdown',
  '.prose',
  '[data-message-text-content]',
  '.message-content',
  '[class*="messageContent"]',
  'p, li',  // Last resort: grab paragraphs
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the first matching element by trying selectors in order.
 *
 * @param {Element} root - Root element to search within
 * @param {string[]} selectors
 * @returns {Element|null}
 */
function firstMatch(root, selectors) {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      // Invalid selector — skip
    }
  }
  return null;
}

/**
 * Extract clean text content from a message element.
 * Preserves code blocks with language tags, strips UI chrome.
 *
 * @param {Element} el - Message content container
 * @returns {string}
 */
function extractContent(el) {
  if (!el) return "";

  // Clone to avoid mutating the DOM
  const clone = el.cloneNode(true);

  // Remove known UI-only elements (buttons, feedback, copy icons)
  const uiSelectors = [
    'button',
    '[aria-label*="copy"]',
    '[aria-label*="thumbs"]',
    '[aria-label*="feedback"]',
    '[data-testid*="copy"]',
    '[class*="feedback"]',
    '[class*="action"]',
    '.sr-only',
    '.visually-hidden',
  ];
  for (const sel of uiSelectors) {
    try {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    } catch { /* skip */ }
  }

  // Annotate code blocks with language before extraction
  clone.querySelectorAll("pre code").forEach((code) => {
    const lang = code.className.match(/language-(\w+)/)?.[1] ?? "";
    const prefix = lang ? `\`\`\`${lang}\n` : "```\n";
    code.textContent = `${prefix}${code.textContent.trim()}\n\`\`\``;
  });

  return clone.textContent?.trim() ?? "";
}

/**
 * Extract role from a message element using multiple strategies.
 *
 * @param {Element} el
 * @returns {'user'|'assistant'|null}
 */
function extractRole(el) {
  for (const extractor of ROLE_EXTRACTORS) {
    try {
      const role = extractor(el);
      if (role === "user" || role === "assistant") return role;
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Try to find a timestamp near a message element.
 *
 * @param {Element} el
 * @returns {string|null} ISO string or null
 */
function extractTimestamp(el) {
  const timeEl = el.querySelector("time[datetime]");
  if (timeEl) return timeEl.getAttribute("datetime");
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scrape the full conversation from a ChatGPT tab.
 *
 * @returns {{messages: Array<{role: string, content: string, timestamp: string|null}>, metadata: Object}}
 */
function scrapeConversation() {
  const messages = [];
  const errors = [];

  // Try each container selector until we get hits
  let containers = [];
  for (const sel of MSG_CONTAINER_SELECTORS) {
    try {
      containers = Array.from(document.querySelectorAll(sel));
      if (containers.length > 0) break;
    } catch { /* skip */ }
  }

  if (containers.length === 0) {
    return {
      messages: [],
      metadata: {
        platform: "chatgpt",
        error: "No message containers found — DOM may have changed",
        url: location.href,
      },
    };
  }

  for (const container of containers) {
    const role = extractRole(container);
    if (!role) continue; // Skip non-message elements (headers, etc.)

    const contentEl = firstMatch(container, CONTENT_SELECTORS) ?? container;
    const content = extractContent(contentEl);
    if (!content) continue;

    const timestamp = extractTimestamp(container);

    messages.push({ role, content, timestamp });
  }

  // Detect model from UI if possible
  let model = null;
  try {
    const modelBtn = document.querySelector(
      '[data-testid="model-selector-button"], [aria-label*="model"] button'
    );
    model = modelBtn?.textContent?.trim() ?? null;
  } catch { /* skip */ }

  // Detect conversation title
  let title = null;
  try {
    title = document.querySelector('title')?.textContent?.trim() ?? null;
  } catch { /* skip */ }

  return {
    messages,
    metadata: {
      platform: "chatgpt",
      model,
      title,
      url: location.href,
      message_count: messages.length,
      scraped_at: new Date().toISOString(),
      errors,
    },
  };
}

// Expose for background script access via chrome.scripting.executeScript
window.__csScraper = window.__csScraper ?? {};
window.__csScraper.chatgpt = scrapeConversation;

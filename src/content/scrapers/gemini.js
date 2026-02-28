/**
 * Gemini DOM scraper for gemini.google.com.
 *
 * Gemini uses a mix of custom web components and React. The response
 * format includes markdown, code blocks, and sometimes canvas/code
 * execution outputs. This scraper targets stable structural elements.
 *
 * Last verified against: Gemini 1.5 Pro on gemini.google.com (Feb 2026)
 *
 * @module scrapers/gemini
 */

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** User turn selectors */
const USER_TURN_SELECTORS = [
  'user-query',
  '[data-response-index] .query-content',
  '.user-query-bubble-with-background',
  '[class*="userQuery"]',
  '.conversation-container .query',
];

/** Model response selectors */
const MODEL_TURN_SELECTORS = [
  'model-response',
  '[data-response-index] .response-content',
  '.model-response-text',
  '[class*="modelResponse"]',
  '.message-content',
];

/** The main conversation container */
const CONVERSATION_CONTAINER_SELECTORS = [
  'chat-history',
  '.chat-history',
  '[data-scroll-to="true"]',
  'main .conversation',
  '[class*="chatHistory"]',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip Gemini-specific UI chrome from a cloned element.
 *
 * @param {Element} clone
 */
function removeGeminiChrome(clone) {
  const toRemove = [
    'button',
    '[aria-label*="more"]',
    '[aria-label*="options"]',
    '[aria-label*="copy"]',
    '[aria-label*="like"]',
    '[aria-label*="dislike"]',
    '[class*="toolbar"]',
    '[class*="action"]',
    '[class*="feedback"]',
    'mat-icon',
    '.sr-only',
    '[class*="loadingIndicator"]',
  ];
  toRemove.forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch { /* skip */ }
  });
}

/**
 * Extract clean text from a Gemini message element.
 * Handles web components (shadow DOM not accessible, but textContent works).
 *
 * @param {Element} el
 * @returns {string}
 */
function extractGeminiContent(el) {
  const clone = el.cloneNode(true);
  removeGeminiChrome(clone);

  // Annotate code blocks
  clone.querySelectorAll("pre code, code-block, [class*='code-block']").forEach((code) => {
    const lang = (
      code.getAttribute("language") ??
      code.className?.match(/language-(\w+)/)?.[1] ??
      code.getAttribute("data-language") ??
      ""
    );
    const prefix = lang ? `\`\`\`${lang}\n` : "```\n";
    const raw = code.textContent?.trim() ?? "";
    code.textContent = `${prefix}${raw}\n\`\`\``;
  });

  // Handle canvas/execution output references
  const canvasEls = clone.querySelectorAll('[class*="canvas"], [class*="execution"]');
  canvasEls.forEach((canvas) => {
    canvas.textContent = `[Canvas/Execution output]`;
  });

  return clone.textContent?.trim() ?? "";
}

/**
 * Try to find timestamp for a turn.
 *
 * @param {Element} el
 * @returns {string|null}
 */
function extractTimestamp(el) {
  const time = el.querySelector("time[datetime]");
  if (time) return time.getAttribute("datetime");
  return null;
}

// ---------------------------------------------------------------------------
// Scraping strategies
// ---------------------------------------------------------------------------

/**
 * Strategy 1: Use custom web component elements (most reliable for Gemini).
 *
 * @returns {Array<{role: string, content: string, timestamp: string|null}>|null}
 */
function scrapeViaComponents() {
  const messages = [];

  const userEls = document.querySelectorAll(USER_TURN_SELECTORS.join(", "));
  const modelEls = document.querySelectorAll(MODEL_TURN_SELECTORS.join(", "));

  if (userEls.length === 0 && modelEls.length === 0) return null;

  // Interleave user and model turns in DOM order
  const allTurns = [
    ...Array.from(userEls).map((el) => ({ el, role: "user" })),
    ...Array.from(modelEls).map((el) => ({ el, role: "assistant" })),
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

/**
 * Strategy 2: Walk the conversation container looking for alternating turns.
 *
 * @returns {Array|null}
 */
function scrapeViaContainer() {
  let container = null;
  for (const sel of CONVERSATION_CONTAINER_SELECTORS) {
    try {
      container = document.querySelector(sel);
      if (container) break;
    } catch { /* skip */ }
  }
  if (!container) return null;

  const messages = [];
  const children = Array.from(container.children);

  for (const child of children) {
    const isUser = USER_TURN_SELECTORS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });
    const isModel = MODEL_TURN_SELECTORS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
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

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scrape the full conversation from a Gemini tab.
 *
 * @returns {{messages: Array, metadata: Object}}
 */
function scrapeConversation() {
  const messages =
    scrapeViaComponents() ??
    scrapeViaContainer() ??
    [];

  // Detect model variant
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
  } catch { /* skip */ }

  return {
    messages,
    metadata: {
      platform: "gemini",
      model,
      url: location.href,
      message_count: messages.length,
      scraped_at: new Date().toISOString(),
    },
  };
}

window.__csScraper = window.__csScraper ?? {};
window.__csScraper.gemini = scrapeConversation;

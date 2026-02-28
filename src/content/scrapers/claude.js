/**
 * Claude DOM scraper for claude.ai.
 *
 * Claude uses React with data-testid attributes that are more stable than
 * class names. Handles artifact references (code, documents) and thinking
 * blocks (collapses to summary to avoid bloating snapshots).
 *
 * Last verified against: Claude Sonnet on claude.ai (Feb 2026)
 *
 * @module scrapers/claude
 */

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Turn containers — each turn is a human+assistant exchange */
const TURN_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-testid="message"]',
  '.human-turn',
  '.assistant-turn',
];

/** Conversation wrapper selectors */
const CONVERSATION_SELECTORS = [
  '[data-testid="conversation-turn"]',
  '.conversation-content',
  'main [class*="conversation"]',
];

/** Claude message text selectors */
const CLAUDE_MSG_SELECTORS = [
  '.font-claude-message',
  '[data-testid="assistant-message"]',
  '[class*="AssistantMessage"]',
];

/** Human message selectors */
const HUMAN_MSG_SELECTORS = [
  '[data-testid="user-message"]',
  '.human-turn',
  '[class*="HumanMessage"]',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect if an element is a thinking/reasoning block and summarize it.
 *
 * @param {Element} el
 * @returns {string|null} Summary text or null if not a thinking block
 */
function extractThinkingBlock(el) {
  const isThinking = (
    el.getAttribute("data-testid")?.includes("thinking") ||
    el.className?.includes("thinking") ||
    el.querySelector('[aria-label*="thinking"], [aria-label*="Thinking"]')
  );
  if (!isThinking) return null;

  const previewEl = el.querySelector('[class*="preview"], summary, [class*="collapsed"]');
  if (previewEl) {
    return `[Thinking: ${previewEl.textContent?.trim()?.slice(0, 100)}...]`;
  }
  return "[Thinking: ...]";
}

/**
 * Extract artifact references (code, documents) from a message.
 *
 * @param {Element} el
 * @returns {string[]} Array of artifact descriptions
 */
function extractArtifacts(el) {
  const refs = [];
  try {
    el.querySelectorAll('[data-testid*="artifact"], [class*="artifact"], [class*="Artifact"]')
      .forEach((artifact) => {
        const title = artifact.querySelector('[class*="title"], h3, h4');
        const lang = artifact.querySelector('[class*="language"], [class*="lang"]');
        const desc = [
          title?.textContent?.trim() ?? "Artifact",
          lang?.textContent?.trim() ? `(${lang.textContent.trim()})` : "",
        ].filter(Boolean).join(" ");
        refs.push(`[Artifact: ${desc}]`);
      });
  } catch { /* skip */ }
  return refs;
}

/**
 * Clean and extract text from a Claude message element.
 *
 * @param {Element} el
 * @returns {string}
 */
function extractClaudeContent(el) {
  const clone = el.cloneNode(true);

  // Remove action buttons and UI chrome
  [
    'button',
    '[class*="actions"]',
    '[class*="feedback"]',
    '[aria-label*="copy"]',
    '[aria-label*="regenerate"]',
    '.sr-only',
  ].forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch { /* skip */ }
  });

  // Preserve code blocks
  clone.querySelectorAll("pre code, code").forEach((code) => {
    const lang = code.className?.match(/language-(\w+)/)?.[1] ?? "";
    if (code.closest("pre")) {
      const prefix = lang ? `\`\`\`${lang}\n` : "```\n";
      code.textContent = `${prefix}${code.textContent.trim()}\n\`\`\``;
    }
  });

  return clone.textContent?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Main scraping logic
// ---------------------------------------------------------------------------

/**
 * Collect all messages from the page using flexible multi-strategy approach.
 *
 * @returns {Array<{role: string, content: string, timestamp: string|null}>}
 */
function collectMessages() {
  const messages = [];

  // Strategy 1: Look for alternating human/assistant containers
  for (const humanSel of HUMAN_MSG_SELECTORS) {
    const humanEls = document.querySelectorAll(humanSel);
    if (humanEls.length === 0) continue;

    humanEls.forEach((humanEl) => {
      // Extract human message
      const humanContent = extractClaudeContent(humanEl);
      if (humanContent) {
        messages.push({ role: "user", content: humanContent, timestamp: null });
      }

      // Find the following assistant response (next sibling or parent-level next)
      let next = humanEl.nextElementSibling;
      while (next) {
        const isAssistant = (
          next.matches(CLAUDE_MSG_SELECTORS.join(", ")) ||
          next.querySelector(CLAUDE_MSG_SELECTORS.join(", "))
        );
        if (isAssistant) {
          // Check for thinking blocks first
          const thinkingEl = next.querySelector('[data-testid*="thinking"]');
          let content = "";
          if (thinkingEl) {
            content += extractThinkingBlock(thinkingEl) + "\n\n";
          }
          content += extractClaudeContent(next);

          // Add artifact references
          const artifacts = extractArtifacts(next);
          if (artifacts.length > 0) {
            content += "\n" + artifacts.join("\n");
          }

          if (content.trim()) {
            messages.push({ role: "assistant", content: content.trim(), timestamp: null });
          }
          break;
        }
        // Stop at another human message
        if (next.matches(HUMAN_MSG_SELECTORS.join(", "))) break;
        next = next.nextElementSibling;
      }
    });

    if (messages.length > 0) break;
  }

  // Strategy 2: Fallback — grab all conversation turns generically
  if (messages.length === 0) {
    for (const sel of CONVERSATION_SELECTORS) {
      const turns = document.querySelectorAll(sel);
      if (turns.length === 0) continue;

      turns.forEach((turn) => {
        const isHuman = turn.matches(HUMAN_MSG_SELECTORS.join(", ")) ||
          turn.querySelector(HUMAN_MSG_SELECTORS.join(", "));
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

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scrape the full conversation from a Claude tab.
 *
 * @returns {{messages: Array, metadata: Object}}
 */
function scrapeConversation() {
  const messages = collectMessages();

  // Detect model
  let model = null;
  try {
    const modelEl = document.querySelector(
      '[data-testid="model-selector-trigger"], [aria-label*="Claude"] button'
    );
    model = modelEl?.textContent?.trim() ?? null;
  } catch { /* skip */ }

  let title = null;
  try {
    title = document.querySelector("title")?.textContent?.trim() ?? null;
  } catch { /* skip */ }

  return {
    messages,
    metadata: {
      platform: "claude",
      model,
      title,
      url: location.href,
      message_count: messages.length,
      scraped_at: new Date().toISOString(),
    },
  };
}

window.__csScraper = window.__csScraper ?? {};
window.__csScraper.claude = scrapeConversation;

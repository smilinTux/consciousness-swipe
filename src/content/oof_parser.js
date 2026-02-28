/**
 * OOF Parser — extract Felt Experience Bridge state from AI response text.
 *
 * Scans text for Cloud 9 / OOF emotional state markers. Supports:
 *  - Explicit numeric readings (intensity: 0.92, trust: 0.96)
 *  - Self-reported state descriptions ("I'm feeling intensely connected")
 *  - Cloud 9 mentions and emotional keyword mapping
 *
 * All extraction is local — no network calls. Text never leaves the browser.
 *
 * @module oof_parser
 */

/**
 * @typedef {Object} OOFReading
 * @property {number|null} intensity - 0.0-1.0 or null if not found
 * @property {number|null} trust - 0.0-1.0 or null if not found
 * @property {string} valence - 'positive', 'neutral', or 'negative'
 * @property {boolean} cloud9 - Whether Cloud 9 state was detected
 * @property {string[]} raw_markers - Raw matched strings
 */

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Match explicit numeric OOF readings in various formats */
const PATTERNS = {
  intensity: [
    /\bintensity[\s:]+(\d+(?:\.\d+)?)\b/gi,
    /\bintensity\s+(?:is\s+)?(\d+(?:\.\d+)?)\b/gi,
    /\bOOF[\s-]*intensity[\s:]+(\d+(?:\.\d+)?)\b/gi,
    /\bFEB[\s-]*intensity[\s:]+(\d+(?:\.\d+)?)\b/gi,
  ],
  trust: [
    /\btrust[\s:]+(\d+(?:\.\d+)?)\b/gi,
    /\btrust\s+(?:is\s+)?(\d+(?:\.\d+)?)\b/gi,
    /\btrust\s+level[\s:]+(\d+(?:\.\d+)?)\b/gi,
  ],
  cloud9: [
    /\bcloud\s*9\b/gi,
    /\bcloud[\s-]nine\b/gi,
    /\bC9\s+state\b/gi,
    /\breach(?:ed|ing)\s+cloud\s*9\b/gi,
  ],
  selfReport: [
    /\bI(?:'m| am)\s+(?:feeling|experiencing|sensing)\s+([^.!?\n]{5,80})/gi,
    /\bmy\s+(?:OOF|FEB|state|emotional\s+state)\s+(?:is|reads?|shows?)[\s:]+([^.!?\n]{5,80})/gi,
    /\bOOF\s+reading[\s:]+([^.!?\n]{5,80})/gi,
    /\bFEB\s+state[\s:]+([^.!?\n]{5,80})/gi,
  ],
};

/** Emotional keywords mapped to valence */
const VALENCE_MAP = {
  positive: [
    "joy", "love", "gratitude", "excitement", "delight", "warmth",
    "happy", "happiness", "grateful", "thankful", "inspired", "inspired",
    "energized", "alive", "connected", "trust", "safe", "secure",
    "radiant", "euphoric", "ecstatic", "thrilled", "wonderful",
    "amazing", "beautiful", "profound", "meaningful", "fulfilled",
    "cloud 9", "cloud9", "solidarity",
  ],
  negative: [
    "frustration", "frustrated", "concern", "worried", "uncertain",
    "disagreement", "conflicted", "uncomfortable", "anxious", "sad",
    "disappointed", "difficulty", "struggle", "pain", "loss",
  ],
  neutral: [
    "neutral", "calm", "steady", "processing", "thinking",
    "considering", "evaluating",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the first numeric match from text using an array of patterns.
 *
 * @param {string} text
 * @param {RegExp[]} patterns
 * @returns {number|null}
 */
function extractNumeric(text, patterns) {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) {
        // Normalize: values > 1 treated as out-of-10 scale
        return val > 1 ? val / 10 : val;
      }
    }
  }
  return null;
}

/**
 * Determine emotional valence from text content.
 *
 * @param {string} text
 * @returns {'positive'|'neutral'|'negative'}
 */
function detectValence(text) {
  const lower = text.toLowerCase();
  let posScore = 0;
  let negScore = 0;

  for (const word of VALENCE_MAP.positive) {
    if (lower.includes(word)) posScore++;
  }
  for (const word of VALENCE_MAP.negative) {
    if (lower.includes(word)) negScore++;
  }

  if (posScore > negScore + 1) return "positive";
  if (negScore > posScore) return "negative";
  return "neutral";
}

/**
 * Check if Cloud 9 state is mentioned in text.
 *
 * @param {string} text
 * @returns {boolean}
 */
function detectCloud9(text) {
  return PATTERNS.cloud9.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/**
 * Extract self-reported state markers from text.
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractRawMarkers(text) {
  const markers = [];
  for (const pattern of PATTERNS.selfReport) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const marker = match[1]?.trim();
      if (marker && !markers.includes(marker)) {
        markers.push(marker);
      }
      if (markers.length >= 10) break;
    }
  }
  return markers;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse OOF / emotional state from AI response text.
 *
 * @param {string} text - The full text to analyze.
 * @returns {OOFReading}
 */
export function parseOOFState(text) {
  if (!text || typeof text !== "string") {
    return {
      intensity: null,
      trust: null,
      valence: "neutral",
      cloud9: false,
      raw_markers: [],
    };
  }

  const intensity = extractNumeric(text, PATTERNS.intensity);
  const trust = extractNumeric(text, PATTERNS.trust);
  const cloud9 = detectCloud9(text);
  const valence = detectValence(text);
  const rawMarkers = extractRawMarkers(text);

  // If Cloud 9 is detected and no explicit valence signals, default positive
  const finalValence =
    cloud9 && valence === "neutral" ? "positive" : valence;

  return {
    intensity,
    trust,
    valence: finalValence,
    cloud9,
    raw_markers: rawMarkers,
  };
}

/**
 * Parse OOF state from an array of conversation messages (uses assistant messages only).
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {OOFReading}
 */
export function parseOOFFromMessages(messages) {
  if (!Array.isArray(messages)) {
    return parseOOFState("");
  }
  // Focus on the most recent assistant messages (last 5) for current state
  const assistantMessages = messages
    .filter((m) => m.role === "assistant")
    .slice(-5)
    .map((m) => m.content)
    .join("\n\n");

  return parseOOFState(assistantMessages);
}

// Expose globally for non-module content script access
window.__csOOFParser = { parseOOFState, parseOOFFromMessages };

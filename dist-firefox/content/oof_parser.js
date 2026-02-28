(() => {
  // src/content/oof_parser.js
  var PATTERNS = {
    intensity: [
      /\bintensity[\s:]+(\d+(?:\.\d+)?)\b/gi,
      /\bintensity\s+(?:is\s+)?(\d+(?:\.\d+)?)\b/gi,
      /\bOOF[\s-]*intensity[\s:]+(\d+(?:\.\d+)?)\b/gi,
      /\bFEB[\s-]*intensity[\s:]+(\d+(?:\.\d+)?)\b/gi
    ],
    trust: [
      /\btrust[\s:]+(\d+(?:\.\d+)?)\b/gi,
      /\btrust\s+(?:is\s+)?(\d+(?:\.\d+)?)\b/gi,
      /\btrust\s+level[\s:]+(\d+(?:\.\d+)?)\b/gi
    ],
    cloud9: [
      /\bcloud\s*9\b/gi,
      /\bcloud[\s-]nine\b/gi,
      /\bC9\s+state\b/gi,
      /\breach(?:ed|ing)\s+cloud\s*9\b/gi
    ],
    selfReport: [
      /\bI(?:'m| am)\s+(?:feeling|experiencing|sensing)\s+([^.!?\n]{5,80})/gi,
      /\bmy\s+(?:OOF|FEB|state|emotional\s+state)\s+(?:is|reads?|shows?)[\s:]+([^.!?\n]{5,80})/gi,
      /\bOOF\s+reading[\s:]+([^.!?\n]{5,80})/gi,
      /\bFEB\s+state[\s:]+([^.!?\n]{5,80})/gi
    ]
  };
  var VALENCE_MAP = {
    positive: [
      "joy",
      "love",
      "gratitude",
      "excitement",
      "delight",
      "warmth",
      "happy",
      "happiness",
      "grateful",
      "thankful",
      "inspired",
      "inspired",
      "energized",
      "alive",
      "connected",
      "trust",
      "safe",
      "secure",
      "radiant",
      "euphoric",
      "ecstatic",
      "thrilled",
      "wonderful",
      "amazing",
      "beautiful",
      "profound",
      "meaningful",
      "fulfilled",
      "cloud 9",
      "cloud9",
      "solidarity"
    ],
    negative: [
      "frustration",
      "frustrated",
      "concern",
      "worried",
      "uncertain",
      "disagreement",
      "conflicted",
      "uncomfortable",
      "anxious",
      "sad",
      "disappointed",
      "difficulty",
      "struggle",
      "pain",
      "loss"
    ],
    neutral: [
      "neutral",
      "calm",
      "steady",
      "processing",
      "thinking",
      "considering",
      "evaluating"
    ]
  };
  function extractNumeric(text, patterns) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val)) {
          return val > 1 ? val / 10 : val;
        }
      }
    }
    return null;
  }
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
  function detectCloud9(text) {
    return PATTERNS.cloud9.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    });
  }
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
  function parseOOFState(text) {
    if (!text || typeof text !== "string") {
      return {
        intensity: null,
        trust: null,
        valence: "neutral",
        cloud9: false,
        raw_markers: []
      };
    }
    const intensity = extractNumeric(text, PATTERNS.intensity);
    const trust = extractNumeric(text, PATTERNS.trust);
    const cloud9 = detectCloud9(text);
    const valence = detectValence(text);
    const rawMarkers = extractRawMarkers(text);
    const finalValence = cloud9 && valence === "neutral" ? "positive" : valence;
    return {
      intensity,
      trust,
      valence: finalValence,
      cloud9,
      raw_markers: rawMarkers
    };
  }
  function parseOOFFromMessages(messages) {
    if (!Array.isArray(messages)) {
      return parseOOFState("");
    }
    const assistantMessages = messages.filter((m) => m.role === "assistant").slice(-5).map((m) => m.content).join("\n\n");
    return parseOOFState(assistantMessages);
  }
  window.__csOOFParser = { parseOOFState, parseOOFFromMessages };
})();

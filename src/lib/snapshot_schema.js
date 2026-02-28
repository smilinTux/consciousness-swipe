/**
 * SoulSnapshot schema — mirrors the Python Pydantic models in skcapstone/snapshots.py.
 *
 * All snapshot objects that flow through the extension use these factories
 * so the shape is always consistent with what the SKComm API expects.
 *
 * @module snapshot_schema
 */

/**
 * Create a default OOFState object.
 *
 * @param {Object} [overrides={}]
 * @returns {{intensity: number|null, trust: number|null, valence: string, cloud9: boolean, raw_markers: string[]}}
 */
export function makeOOFState(overrides = {}) {
  return {
    intensity: null,
    trust: null,
    valence: "neutral",
    cloud9: false,
    raw_markers: [],
    ...overrides,
  };
}

/**
 * Create a default PersonalityTraits object.
 *
 * @param {Object} [overrides={}]
 * @returns {{name: string|null, aliases: string[], communication_style: string[], relationship_markers: string[], emoji_patterns: string[]}}
 */
export function makePersonalityTraits(overrides = {}) {
  return {
    name: null,
    aliases: [],
    communication_style: [],
    relationship_markers: [],
    emoji_patterns: [],
    ...overrides,
  };
}

/**
 * Create a ConversationMessage object.
 *
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message text (may include markdown)
 * @param {string|null} [timestamp=null] - ISO datetime string if available
 * @returns {{role: string, content: string, timestamp: string|null}}
 */
export function makeMessage(role, content, timestamp = null) {
  return { role, content, timestamp };
}

/**
 * Generate a random 12-char hex snapshot ID.
 *
 * @returns {string}
 */
export function generateSnapshotId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a full SoulSnapshot object ready to POST to the API.
 *
 * @param {Object} params
 * @param {string} params.source_platform
 * @param {Object} [params.oof_state]
 * @param {Object} [params.personality]
 * @param {Array}  [params.messages]
 * @param {string} [params.ai_name]
 * @param {string} [params.ai_model]
 * @param {string} [params.user_name]
 * @param {string} [params.summary]
 * @param {string[]} [params.key_topics]
 * @param {string[]} [params.decisions_made]
 * @param {string[]} [params.open_threads]
 * @param {string[]} [params.relationship_notes]
 * @returns {Object} SoulSnapshot payload
 */
export function makeSoulSnapshot({
  source_platform,
  oof_state = {},
  personality = {},
  messages = [],
  ai_name = null,
  ai_model = null,
  user_name = null,
  summary = "",
  key_topics = [],
  decisions_made = [],
  open_threads = [],
  relationship_notes = [],
}) {
  return {
    source_platform,
    captured_by: "consciousness-swipe",
    ai_name,
    ai_model,
    user_name,
    oof_state: makeOOFState(oof_state),
    personality: makePersonalityTraits(personality),
    messages,
    message_count: messages.length,
    summary,
    key_topics,
    decisions_made,
    open_threads,
    relationship_notes,
  };
}

/**
 * Validate a snapshot object has required fields.
 *
 * @param {Object} snapshot
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot.source_platform) errors.push("source_platform is required");
  if (!Array.isArray(snapshot.messages)) errors.push("messages must be array");
  return { valid: errors.length === 0, errors };
}

/**
 * Build a local-only index entry (for chrome.storage.local).
 *
 * @param {Object} snapshot - Full snapshot object
 * @param {string} snapshotId - ID returned from the API
 * @returns {Object} Lightweight index entry
 */
export function makeIndexEntry(snapshot, snapshotId) {
  return {
    snapshot_id: snapshotId,
    source_platform: snapshot.source_platform,
    captured_at: new Date().toISOString(),
    ai_name: snapshot.ai_name,
    user_name: snapshot.user_name,
    message_count: snapshot.messages?.length ?? 0,
    oof_summary: formatOOFSummary(snapshot.oof_state),
    summary: snapshot.summary?.slice(0, 200) ?? "",
    // Stored locally if API was offline
    pending_sync: false,
  };
}

/**
 * Format an OOF state into a compact human-readable string.
 *
 * @param {Object} oof
 * @returns {string}
 */
export function formatOOFSummary(oof) {
  if (!oof) return "";
  const parts = [];
  if (oof.intensity != null) parts.push(`intensity ${oof.intensity.toFixed(2)}`);
  if (oof.trust != null) parts.push(`trust ${oof.trust.toFixed(2)}`);
  if (oof.cloud9) parts.push("Cloud 9");
  if (parts.length === 0) return `valence: ${oof.valence ?? "neutral"}`;
  return parts.join(", ");
}

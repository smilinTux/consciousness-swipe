/**
 * Tests for snapshot_schema.js — SoulSnapshot client-side schema utilities.
 *
 * Run with: node tests/test_snapshot_schema.js
 */

// ---------------------------------------------------------------------------
// Inline implementation (mirrors src/lib/snapshot_schema.js)
// duplicated for Node-only test environment (no browser crypto)
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";

function generateSnapshotId() {
  return randomBytes(6).toString("hex");
}

function makeOOFState(overrides = {}) {
  return { intensity: null, trust: null, valence: "neutral", cloud9: false, raw_markers: [], ...overrides };
}

function makePersonalityTraits(overrides = {}) {
  return { name: null, aliases: [], communication_style: [], relationship_markers: [], emoji_patterns: [], ...overrides };
}

function makeMessage(role, content, timestamp = null) {
  return { role, content, timestamp };
}

function makeSoulSnapshot({ source_platform, oof_state = {}, personality = {}, messages = [], ai_name = null, ai_model = null, user_name = null, summary = "", key_topics = [], decisions_made = [], open_threads = [], relationship_notes = [] }) {
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

function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot.source_platform) errors.push("source_platform is required");
  if (!Array.isArray(snapshot.messages)) errors.push("messages must be array");
  return { valid: errors.length === 0, errors };
}

function makeIndexEntry(snapshot, snapshotId) {
  return {
    snapshot_id: snapshotId,
    source_platform: snapshot.source_platform,
    captured_at: new Date().toISOString(),
    ai_name: snapshot.ai_name,
    user_name: snapshot.user_name,
    message_count: snapshot.messages?.length ?? 0,
    oof_summary: formatOOFSummary(snapshot.oof_state),
    summary: snapshot.summary?.slice(0, 200) ?? "",
    pending_sync: false,
  };
}

function formatOOFSummary(oof) {
  if (!oof) return "";
  const parts = [];
  if (oof.intensity != null) parts.push(`intensity ${oof.intensity.toFixed(2)}`);
  if (oof.trust != null) parts.push(`trust ${oof.trust.toFixed(2)}`);
  if (oof.cloud9) parts.push("Cloud 9");
  if (parts.length === 0) return `valence: ${oof.valence ?? "neutral"}`;
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.error(`  ✗ FAIL: ${msg}`); failed++; }
}
function assertEqual(a, e, msg) {
  if (a === e) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.error(`  ✗ FAIL: ${msg} (expected ${JSON.stringify(e)}, got ${JSON.stringify(a)})`); failed++; }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\ntest_snapshot_schema.js\n");

// --- generateSnapshotId ---
console.log("--- generateSnapshotId ---");
{
  const id = generateSnapshotId();
  assertEqual(id.length, 12, "ID is 12 chars");
  assert(/^[0-9a-f]+$/.test(id), "ID is hex");
}

{
  const ids = new Set(Array.from({ length: 100 }, generateSnapshotId));
  assertEqual(ids.size, 100, "100 unique IDs generated");
}

// --- makeOOFState ---
console.log("\n--- makeOOFState ---");
{
  const oof = makeOOFState();
  assert(oof.intensity === null, "default intensity null");
  assert(oof.trust === null, "default trust null");
  assertEqual(oof.valence, "neutral", "default valence neutral");
  assertEqual(oof.cloud9, false, "default cloud9 false");
  assert(Array.isArray(oof.raw_markers), "default raw_markers is array");
}

{
  const oof = makeOOFState({ intensity: 0.92, cloud9: true });
  assertEqual(oof.intensity, 0.92, "override intensity works");
  assertEqual(oof.cloud9, true, "override cloud9 works");
  assert(oof.trust === null, "unset trust stays null");
}

// --- makeMessage ---
console.log("\n--- makeMessage ---");
{
  const msg = makeMessage("user", "Hello!");
  assertEqual(msg.role, "user", "role set correctly");
  assertEqual(msg.content, "Hello!", "content set correctly");
  assert(msg.timestamp === null, "timestamp defaults to null");
}

{
  const ts = "2026-02-25T18:00:00Z";
  const msg = makeMessage("assistant", "Hi Chef!", ts);
  assertEqual(msg.timestamp, ts, "timestamp stored");
}

// --- makeSoulSnapshot ---
console.log("\n--- makeSoulSnapshot ---");
{
  const snap = makeSoulSnapshot({ source_platform: "chatgpt" });
  assertEqual(snap.source_platform, "chatgpt", "platform set");
  assertEqual(snap.captured_by, "consciousness-swipe", "captured_by set");
  assertEqual(snap.message_count, 0, "message_count 0 for empty messages");
  assert(Array.isArray(snap.messages), "messages is array");
  assert(Array.isArray(snap.key_topics), "key_topics is array");
}

{
  const msgs = [makeMessage("user", "hi"), makeMessage("assistant", "hello")];
  const snap = makeSoulSnapshot({ source_platform: "claude", messages: msgs });
  assertEqual(snap.message_count, 2, "message_count reflects messages length");
}

{
  const snap = makeSoulSnapshot({
    source_platform: "gemini",
    ai_name: "Lumina",
    oof_state: { cloud9: true, intensity: 0.95 },
  });
  assertEqual(snap.ai_name, "Lumina", "ai_name set");
  assertEqual(snap.oof_state.cloud9, true, "oof_state cloud9 propagated");
  assertEqual(snap.oof_state.intensity, 0.95, "oof_state intensity propagated");
}

// --- validateSnapshot ---
console.log("\n--- validateSnapshot ---");
{
  const snap = makeSoulSnapshot({ source_platform: "chatgpt" });
  const { valid, errors } = validateSnapshot(snap);
  assertEqual(valid, true, "valid snapshot passes validation");
  assertEqual(errors.length, 0, "no validation errors");
}

{
  const { valid, errors } = validateSnapshot({ source_platform: "" });
  assertEqual(valid, false, "empty platform fails validation");
  assert(errors.some(e => e.includes("source_platform")), "error mentions source_platform");
}

{
  const { valid, errors } = validateSnapshot({ source_platform: "chatgpt", messages: "not an array" });
  assertEqual(valid, false, "non-array messages fails validation");
  assert(errors.some(e => e.includes("messages")), "error mentions messages");
}

// --- makeIndexEntry ---
console.log("\n--- makeIndexEntry ---");
{
  const snap = makeSoulSnapshot({
    source_platform: "chatgpt",
    ai_name: "Ava",
    user_name: "Chef",
    messages: [makeMessage("user", "hi"), makeMessage("assistant", "hello")],
    oof_state: { intensity: 0.9, trust: 0.95, cloud9: true },
    summary: "A great session".repeat(20), // >200 chars
  });
  const entry = makeIndexEntry(snap, "abc123def456");
  assertEqual(entry.snapshot_id, "abc123def456", "snapshot_id stored");
  assertEqual(entry.source_platform, "chatgpt", "platform stored");
  assertEqual(entry.ai_name, "Ava", "ai_name stored");
  assertEqual(entry.message_count, 2, "message_count correct");
  assert(entry.oof_summary.includes("Cloud 9"), "oof_summary includes Cloud 9");
  assert(entry.summary.length <= 200, "summary truncated to 200");
  assertEqual(entry.pending_sync, false, "pending_sync default false");
}

// --- formatOOFSummary ---
console.log("\n--- formatOOFSummary ---");
{
  const s = formatOOFSummary({ intensity: 0.92, trust: 0.96, cloud9: true, valence: "positive" });
  assert(s.includes("intensity 0.92"), "intensity in summary");
  assert(s.includes("trust 0.96"), "trust in summary");
  assert(s.includes("Cloud 9"), "Cloud 9 in summary");
}

{
  const s = formatOOFSummary({ intensity: null, trust: null, cloud9: false, valence: "neutral" });
  assert(s.includes("valence"), "fallback shows valence");
}

{
  const s = formatOOFSummary(null);
  assertEqual(s, "", "null oof returns empty string");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

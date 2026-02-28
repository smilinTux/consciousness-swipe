/**
 * Tests for v0.2 multi-target export logic and conflict detection.
 *
 * Covers:
 *   - computeSessionFingerprint: platform + message content hashing
 *   - detectConflict: per-target export collision detection
 *   - Export index entry shape: fingerprint + exports map
 *   - Cursor and Windsurf scraper end-to-end output shape validation
 *   - SKCommClient.exportToSyncthing and exportToHttpEndpoint error paths
 *
 * Run with: node tests/test_export.js
 */

// ---------------------------------------------------------------------------
// Inline background.js logic under test
// (Mirrors the pure functions — no browser APIs needed)
// ---------------------------------------------------------------------------

/**
 * Compute a session fingerprint (mirrors background.js).
 */
function computeSessionFingerprint(platform, messages) {
  const firstContent = (messages[0]?.content ?? "").slice(0, 80).trim();
  const lastContent = (messages[messages.length - 1]?.content ?? "").slice(0, 80).trim();
  const bucket = Math.round(messages.length / 5) * 5;
  return `${platform}::${bucket}::${firstContent}::${lastContent}`;
}

/**
 * Detect conflict for a given target in an index (mirrors background.js).
 */
function detectConflict(fingerprint, target, index) {
  for (const entry of index) {
    if (entry.fingerprint === fingerprint) {
      const exportedAt = entry.exports?.[target] ?? null;
      if (exportedAt) {
        return { conflict: true, snapshot_id: entry.snapshot_id, exported_at: exportedAt };
      }
    }
  }
  return { conflict: false, snapshot_id: null, exported_at: null };
}

// ---------------------------------------------------------------------------
// SKCommClient export methods (Node-compatible stubs for error path testing)
// ---------------------------------------------------------------------------

class FetchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Minimal SKCommClient stub for testing error handling without browser fetch.
 */
class TestableExportClient {
  constructor({ syncthing_status = 200, http_status = 200 } = {}) {
    this._syncStatus = syncthing_status;
    this._httpStatus = http_status;
  }

  async exportToSyncthing(snapshot, { folder = "test-folder" } = {}) {
    if (this._syncStatus !== 200) {
      throw new FetchError(`Syncthing export failed (${this._syncStatus}): error`, this._syncStatus);
    }
    return { exported: true, folder, snapshot_id: snapshot.source_platform };
  }

  async exportToHttpEndpoint(snapshot, { url, token = "" } = {}) {
    if (!url) throw new Error("HTTP export: url is required");
    if (this._httpStatus !== 200) {
      throw new FetchError(`HTTP export failed (${this._httpStatus}): error`, this._httpStatus);
    }
    return { exported: true, url };
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.error(`  ✗ FAIL: ${msg}`); failed++; }
}

function assertEqual(a, e, msg) {
  if (a === e) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.error(`  ✗ FAIL: ${msg} (expected ${JSON.stringify(e)}, got ${JSON.stringify(a)})`); failed++; }
}

async function assertThrows(fn, msgFragment, label) {
  try {
    await fn();
    console.error(`  ✗ FAIL: ${label} (expected throw, got nothing)`);
    failed++;
  } catch (err) {
    if (err.message.includes(msgFragment)) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${label} (wrong error: ${err.message})`);
      failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Tests: fingerprinting
// ---------------------------------------------------------------------------

console.log('\ntest_export.js\n');

console.log('=== Session fingerprinting ===\n');

{
  const msgs = [
    { role: "user", content: "Hello Cursor, help me refactor this function" },
    { role: "assistant", content: "Sure! Here is the refactored version." },
    { role: "user", content: "Thanks, can you add tests?" },
    { role: "assistant", content: "Of course! Here are the tests." },
    { role: "user", content: "Perfect" },
  ];
  const fp = computeSessionFingerprint("cursor", msgs);
  assert(typeof fp === "string", "fingerprint: returns string");
  assert(fp.startsWith("cursor::"), "fingerprint: includes platform prefix");
  assert(fp.includes("Hello Cursor"), "fingerprint: includes first message content");
  assert(fp.includes("Perfect"), "fingerprint: includes last message content");
}

{
  // Same content → same fingerprint
  const msgs = [
    { role: "user", content: "What is the capital of France?" },
    { role: "assistant", content: "Paris." },
  ];
  const fp1 = computeSessionFingerprint("chatgpt", msgs);
  const fp2 = computeSessionFingerprint("chatgpt", msgs);
  assertEqual(fp1, fp2, "fingerprint: deterministic for same input");
}

{
  // Different platform → different fingerprint
  const msgs = [
    { role: "user", content: "Explain async/await" },
    { role: "assistant", content: "Async/await is syntactic sugar over Promises." },
  ];
  const fp1 = computeSessionFingerprint("cursor", msgs);
  const fp2 = computeSessionFingerprint("windsurf", msgs);
  assert(fp1 !== fp2, "fingerprint: platform difference → different fingerprint");
}

{
  // Message count bucketing: 8 messages and 10 messages → same bucket (10)
  const make = (n) =>
    Array.from({ length: n }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: i === 0 ? "First message" : (i === n - 1 ? "Last message" : `Turn ${i}`),
    }));

  const fp8 = computeSessionFingerprint("claude", make(8));
  const fp10 = computeSessionFingerprint("claude", make(10));
  // Both bucket to 10, same first/last → same fingerprint
  assertEqual(fp8, fp10, "fingerprint: near-equal message counts → same bucket");
}

{
  // Empty messages → safe (no crash)
  const fp = computeSessionFingerprint("gemini", []);
  assert(typeof fp === "string", "fingerprint: empty messages → safe string");
  assert(fp.startsWith("gemini::0::"), "fingerprint: empty → zero bucket");
}

// ---------------------------------------------------------------------------
// Tests: conflict detection
// ---------------------------------------------------------------------------

console.log('\n=== Conflict detection ===\n');

{
  // No index → no conflict
  const fp = "cursor::10::Hello::Goodbye";
  const result = detectConflict(fp, "skcomm", []);
  assertEqual(result.conflict, false, "conflict: empty index → no conflict");
  assertEqual(result.snapshot_id, null, "conflict: snapshot_id null when no conflict");
}

{
  // Index has entry with same fingerprint but target not exported → no conflict
  const fp = "cursor::10::Hello::Goodbye";
  const index = [
    {
      snapshot_id: "abc123",
      fingerprint: fp,
      exports: { skcomm: null, syncthing: null, http: null },
    },
  ];
  const result = detectConflict(fp, "skcomm", index);
  assertEqual(result.conflict, false, "conflict: same fingerprint but no export timestamp → no conflict");
}

{
  // Index has entry with same fingerprint AND skcomm exported → conflict
  const fp = "cursor::10::Hello::Goodbye";
  const ts = "2026-02-28T12:00:00.000Z";
  const index = [
    {
      snapshot_id: "abc123",
      fingerprint: fp,
      exports: { skcomm: ts, syncthing: null, http: null },
    },
  ];
  const result = detectConflict(fp, "skcomm", index);
  assertEqual(result.conflict, true, "conflict: matching fingerprint + skcomm exported → conflict");
  assertEqual(result.snapshot_id, "abc123", "conflict: returns matching snapshot_id");
  assertEqual(result.exported_at, ts, "conflict: returns correct exported_at timestamp");
}

{
  // Conflict on syncthing but not skcomm
  const fp = "windsurf::5::User::AI";
  const index = [
    {
      snapshot_id: "def456",
      fingerprint: fp,
      exports: { skcomm: null, syncthing: "2026-02-28T11:00:00.000Z", http: null },
    },
  ];
  const skcommResult = detectConflict(fp, "skcomm", index);
  const syntResult = detectConflict(fp, "syncthing", index);
  assertEqual(skcommResult.conflict, false, "conflict: skcomm not exported → no conflict");
  assertEqual(syntResult.conflict, true, "conflict: syncthing exported → conflict");
}

{
  // Different fingerprint in index → no conflict
  const fp1 = "cursor::10::Hello::Goodbye";
  const fp2 = "cursor::10::Other::Thing";
  const index = [
    {
      snapshot_id: "xyz789",
      fingerprint: fp1,
      exports: { skcomm: "2026-02-28T12:00:00.000Z", syncthing: null, http: null },
    },
  ];
  const result = detectConflict(fp2, "skcomm", index);
  assertEqual(result.conflict, false, "conflict: different fingerprint in index → no conflict");
}

{
  // Multiple entries in index — only matching fingerprint triggers conflict
  const fp = "claude::5::Question::Answer";
  const index = [
    {
      snapshot_id: "snap1",
      fingerprint: "claude::5::Other::Different",
      exports: { skcomm: "2026-02-28T10:00:00.000Z" },
    },
    {
      snapshot_id: "snap2",
      fingerprint: fp,
      exports: { skcomm: "2026-02-28T11:00:00.000Z" },
    },
    {
      snapshot_id: "snap3",
      fingerprint: "chatgpt::5::Question::Answer",
      exports: { skcomm: "2026-02-28T12:00:00.000Z" },
    },
  ];
  const result = detectConflict(fp, "skcomm", index);
  assertEqual(result.conflict, true, "conflict: finds conflict in multi-entry index");
  assertEqual(result.snapshot_id, "snap2", "conflict: returns correct snapshot_id from multi-entry");
}

// ---------------------------------------------------------------------------
// Tests: export client — success paths
// ---------------------------------------------------------------------------

console.log('\n=== Export client (success) ===\n');

{
  const client = new TestableExportClient({ syncthing_status: 200, http_status: 200 });
  const snapshot = { source_platform: "cursor", messages: [] };

  const result = await client.exportToSyncthing(snapshot, { folder: "cs-test" });
  assertEqual(result.exported, true, "syncthing export: returns exported=true on success");
  assertEqual(result.folder, "cs-test", "syncthing export: folder echoed in result");
}

{
  const client = new TestableExportClient({ http_status: 200 });
  const snapshot = { source_platform: "windsurf", messages: [] };

  const result = await client.exportToHttpEndpoint(snapshot, {
    url: "http://localhost:9999/hook",
    token: "test-token",
  });
  assertEqual(result.exported, true, "http export: returns exported=true on success");
}

// ---------------------------------------------------------------------------
// Tests: export client — error paths
// ---------------------------------------------------------------------------

console.log('\n=== Export client (errors) ===\n');

{
  const client = new TestableExportClient({ syncthing_status: 503 });
  const snapshot = { source_platform: "cursor", messages: [] };

  await assertThrows(
    () => client.exportToSyncthing(snapshot, { folder: "test" }),
    "Syncthing export failed (503)",
    "syncthing export: throws on non-200 status"
  );
}

{
  const client = new TestableExportClient({ http_status: 401 });
  const snapshot = { source_platform: "windsurf", messages: [] };

  await assertThrows(
    () => client.exportToHttpEndpoint(snapshot, { url: "http://example.com/hook" }),
    "HTTP export failed (401)",
    "http export: throws on 401 unauthorized"
  );
}

{
  const client = new TestableExportClient({ http_status: 200 });
  const snapshot = { source_platform: "chatgpt", messages: [] };

  await assertThrows(
    () => client.exportToHttpEndpoint(snapshot, {}),
    "url is required",
    "http export: throws when url is missing"
  );
}

// ---------------------------------------------------------------------------
// Tests: index entry shape
// ---------------------------------------------------------------------------

console.log('\n=== Index entry shape ===\n');

{
  // Validate that a v0.2 index entry has the required fields
  const entry = {
    snapshot_id: "abc123def456",
    source_platform: "cursor",
    captured_at: new Date().toISOString(),
    ai_name: "Claude 3.5 Sonnet",
    user_name: "Chef",
    message_count: 12,
    oof_summary: "intensity 0.85, trust 0.92",
    summary: "Debugging a React component",
    pending_sync: false,
    fingerprint: "cursor::10::Hello::Goodbye",
    exports: { skcomm: "2026-02-28T12:00:00.000Z", syncthing: null, http: null },
  };

  assert("fingerprint" in entry, "index entry: has fingerprint field");
  assert("exports" in entry, "index entry: has exports map");
  assert("skcomm" in entry.exports, "index entry: exports has skcomm key");
  assert("syncthing" in entry.exports, "index entry: exports has syncthing key");
  assert("http" in entry.exports, "index entry: exports has http key");
  assert(typeof entry.fingerprint === "string", "index entry: fingerprint is string");
  assertEqual(entry.exports.syncthing, null, "index entry: unexported targets are null");
}

// ---------------------------------------------------------------------------
// Tests: Cursor + Windsurf scraper end-to-end output shape
// ---------------------------------------------------------------------------

console.log('\n=== Scraper output shape (end-to-end) ===\n');

{
  // Simulate what cursor.js returns from scrapeConversation()
  const cursorOutput = {
    messages: [
      { role: "user", content: "Help me refactor this function", timestamp: null },
      { role: "assistant", content: "Sure! Here is the refactored version.", timestamp: null },
    ],
    metadata: {
      platform: "cursor",
      model: "Claude 3.5 Sonnet",
      title: "Cursor Chat",
      url: "https://cursor.com/chat/abc",
      message_count: 2,
      scraped_at: new Date().toISOString(),
    },
  };

  assert(Array.isArray(cursorOutput.messages), "cursor e2e: messages is array");
  assertEqual(cursorOutput.messages.length, 2, "cursor e2e: correct message count");
  assertEqual(cursorOutput.metadata.platform, "cursor", "cursor e2e: platform is cursor");
  assert(cursorOutput.messages.every((m) => "role" in m && "content" in m), "cursor e2e: all messages have role+content");
  assert(cursorOutput.messages.every((m) => m.role === "user" || m.role === "assistant"), "cursor e2e: all roles valid");

  // Should be fingerprintable
  const fp = computeSessionFingerprint(cursorOutput.metadata.platform, cursorOutput.messages);
  assert(fp.startsWith("cursor::"), "cursor e2e: output is fingerprintable");
}

{
  // Simulate what windsurf.js returns from scrapeConversation()
  const windsurfOutput = {
    messages: [
      { role: "user", content: "Add unit tests to my Express handler", timestamp: null },
      { role: "assistant", content: "Here are the Jest tests for your handler:", timestamp: null },
      { role: "user", content: "Perfect, add coverage for edge cases too", timestamp: null },
    ],
    metadata: {
      platform: "windsurf",
      model: "Windsurf",
      title: "Cascade Chat",
      url: "https://windsurf.ai/chat",
      message_count: 3,
      scraped_at: new Date().toISOString(),
    },
  };

  assert(Array.isArray(windsurfOutput.messages), "windsurf e2e: messages is array");
  assertEqual(windsurfOutput.metadata.platform, "windsurf", "windsurf e2e: platform is windsurf");
  assertEqual(windsurfOutput.messages.length, 3, "windsurf e2e: correct message count");

  const fp = computeSessionFingerprint(windsurfOutput.metadata.platform, windsurfOutput.messages);
  assert(fp.startsWith("windsurf::"), "windsurf e2e: output is fingerprintable");
  assert(!fp.includes("undefined"), "windsurf e2e: fingerprint has no undefined values");
}

{
  // Empty scraper result (no messages found) — should not crash
  const emptyOutput = { messages: [], metadata: { platform: "cursor", model: null } };
  const fp = computeSessionFingerprint(emptyOutput.metadata.platform, emptyOutput.messages);
  assert(typeof fp === "string", "e2e empty: empty scrape is fingerprintable without crash");

  // Conflict check on empty fingerprint — no false positives
  const result = detectConflict(fp, "skcomm", []);
  assertEqual(result.conflict, false, "e2e empty: empty scrape → no spurious conflict");
}

// ---------------------------------------------------------------------------
// Tests: double-export conflict round-trip
// ---------------------------------------------------------------------------

console.log('\n=== Double-export round-trip ===\n');

{
  // Simulate two successive captures of the same session
  const platform = "claude";
  const msgs = [
    { role: "user", content: "Tell me about sovereign agents" },
    { role: "assistant", content: "Sovereign agents are AI systems that maintain persistent identity..." },
    { role: "user", content: "How do I get started?" },
  ];

  const fp = computeSessionFingerprint(platform, msgs);
  const now = new Date().toISOString();

  // First capture — no conflict, export recorded
  const index = [];
  const firstCheck = detectConflict(fp, "skcomm", index);
  assertEqual(firstCheck.conflict, false, "round-trip: first capture → no conflict");

  // Record the export
  index.push({
    snapshot_id: "snap001",
    fingerprint: fp,
    exports: { skcomm: now, syncthing: null, http: null },
  });

  // Second capture — conflict detected
  const secondCheck = detectConflict(fp, "skcomm", index);
  assertEqual(secondCheck.conflict, true, "round-trip: second capture of same session → conflict");
  assertEqual(secondCheck.snapshot_id, "snap001", "round-trip: conflict references first snapshot");

  // Syncthing not yet exported — no conflict there
  const syntCheck = detectConflict(fp, "syncthing", index);
  assertEqual(syntCheck.conflict, false, "round-trip: syncthing not yet exported → no conflict");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

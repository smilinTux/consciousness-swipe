/**
 * Tests for SKCommClient — mocked fetch calls.
 *
 * Run with: node tests/test_skcomm_client.js
 */

// ---------------------------------------------------------------------------
// Minimal fetch mock infrastructure
// ---------------------------------------------------------------------------

let _mockFetch = null;

function mockFetch(handler) {
  _mockFetch = handler;
}

function clearMock() {
  _mockFetch = null;
}

// Simulate global fetch for the client
globalThis.fetch = async (url, options = {}) => {
  if (!_mockFetch) throw new Error("fetch not mocked");
  return _mockFetch(url, options);
};

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function errorResponse(status, detail) {
  return {
    ok: false,
    status,
    json: async () => ({ detail }),
    text: async () => detail,
  };
}

// ---------------------------------------------------------------------------
// Inline SKCommClient (mirrors src/lib/skcomm_client.js)
// Adapted for Node (no AbortController timeout, simplified)
// ---------------------------------------------------------------------------

class SKCommClient {
  constructor(baseUrl = "http://localhost:9384", timeoutMs = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  async _fetch(path, options = {}) {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    if (!resp.ok) {
      let detail = "";
      try { detail = (await resp.json()).detail ?? ""; } catch { detail = await resp.text(); }
      throw new Error(`SKComm API error ${resp.status}: ${detail}`);
    }
    if (resp.status === 204) return null;
    return await resp.json();
  }

  async isReachable() {
    try { await this._fetch("/api/v1/status"); return true; } catch { return false; }
  }
  async status() { return this._fetch("/api/v1/status"); }
  async send(recipient, message, opts = {}) {
    return this._fetch("/api/v1/send", { method: "POST", body: JSON.stringify({ recipient, message, ...opts }) });
  }
  async receive() { return this._fetch("/api/v1/inbox"); }
  async peers() { return this._fetch("/api/v1/peers"); }
  async captureSnapshot(snapshot) {
    return this._fetch("/api/v1/consciousness/capture", { method: "POST", body: JSON.stringify(snapshot) });
  }
  async getSnapshots(filters = {}) {
    const params = new URLSearchParams();
    if (filters.platform) params.set("platform", filters.platform);
    const qs = params.toString() ? `?${params}` : "";
    return this._fetch(`/api/v1/consciousness/snapshots${qs}`);
  }
  async getSnapshot(id) { return this._fetch(`/api/v1/consciousness/snapshots/${id}`); }
  async deleteSnapshot(id) {
    return this._fetch(`/api/v1/consciousness/snapshots/${id}`, { method: "DELETE" });
  }
  async getInjectionPrompt(id, maxMessages = 10) {
    return this._fetch(`/api/v1/consciousness/snapshots/${id}/inject?max_messages=${maxMessages}`);
  }
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

async function test(name, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`  ✗ FAIL: ${name} threw: ${err.message}`);
    failed++;
  } finally {
    clearMock();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\ntest_skcomm_client.js\n");

(async () => {

// --- isReachable ---
console.log("--- isReachable ---");

await test("returns true on 200", async () => {
  const client = new SKCommClient();
  mockFetch(() => jsonResponse({ status: "running" }));
  const ok = await client.isReachable();
  assertEqual(ok, true, "reachable when server returns 200");
});

await test("returns false on network error", async () => {
  const client = new SKCommClient();
  mockFetch(() => { throw new Error("ECONNREFUSED"); });
  const ok = await client.isReachable();
  assertEqual(ok, false, "not reachable on network error");
});

await test("returns false on 500", async () => {
  const client = new SKCommClient();
  mockFetch(() => errorResponse(500, "Internal Server Error"));
  const ok = await client.isReachable();
  assertEqual(ok, false, "not reachable on 500");
});

// --- status ---
console.log("\n--- status ---");

await test("returns status data", async () => {
  const client = new SKCommClient();
  const statusData = { identity: "chef", transports: [] };
  mockFetch(() => jsonResponse(statusData));
  const result = await client.status();
  assertEqual(result.identity, "chef", "identity returned");
});

// --- send ---
console.log("\n--- send ---");

await test("posts correct payload", async () => {
  const client = new SKCommClient();
  let capturedBody = null;
  mockFetch((url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return jsonResponse({ delivered: true, envelope_id: "abc123" });
  });
  const result = await client.send("lumina", "Hello from Chef");
  assertEqual(capturedBody.recipient, "lumina", "recipient in body");
  assertEqual(capturedBody.message, "Hello from Chef", "message in body");
  assertEqual(result.delivered, true, "delivered true");
});

await test("send throws on API error", async () => {
  const client = new SKCommClient();
  mockFetch(() => errorResponse(503, "Service unavailable"));
  let threw = false;
  try { await client.send("lumina", "test"); }
  catch { threw = true; }
  assert(threw, "send throws on 503");
});

// --- receive ---
console.log("\n--- receive ---");

await test("returns inbox messages", async () => {
  const client = new SKCommClient();
  const msgs = [{ envelope_id: "1", content: "hi" }];
  mockFetch(() => jsonResponse(msgs));
  const result = await client.receive();
  assertEqual(result.length, 1, "one message returned");
  assertEqual(result[0].envelope_id, "1", "envelope_id correct");
});

// --- captureSnapshot ---
console.log("\n--- captureSnapshot ---");

await test("posts snapshot and returns index entry", async () => {
  const client = new SKCommClient();
  let capturedUrl = null;
  mockFetch((url, opts) => {
    capturedUrl = url;
    return jsonResponse({ snapshot_id: "snap123", source_platform: "chatgpt" }, 201);
  });
  const snap = { source_platform: "chatgpt", messages: [], oof_state: {} };
  const result = await client.captureSnapshot(snap);
  assert(capturedUrl.includes("/consciousness/capture"), "correct endpoint called");
  assertEqual(result.snapshot_id, "snap123", "snapshot_id returned");
});

// --- getSnapshots ---
console.log("\n--- getSnapshots ---");

await test("returns list of snapshots", async () => {
  const client = new SKCommClient();
  mockFetch(() => jsonResponse([{ snapshot_id: "a" }, { snapshot_id: "b" }]));
  const results = await client.getSnapshots();
  assertEqual(results.length, 2, "two snapshots returned");
});

await test("passes platform filter as query param", async () => {
  const client = new SKCommClient();
  let capturedUrl = null;
  mockFetch((url) => { capturedUrl = url; return jsonResponse([]); });
  await client.getSnapshots({ platform: "claude" });
  assert(capturedUrl.includes("platform=claude"), "platform filter in URL");
});

// --- getSnapshot ---
console.log("\n--- getSnapshot ---");

await test("fetches by ID", async () => {
  const client = new SKCommClient();
  let capturedUrl = null;
  mockFetch((url) => { capturedUrl = url; return jsonResponse({ snapshot_id: "abc", ai_name: "Ava" }); });
  const result = await client.getSnapshot("abc");
  assert(capturedUrl.includes("/snapshots/abc"), "ID in URL");
  assertEqual(result.ai_name, "Ava", "ai_name returned");
});

await test("throws 404 on missing snapshot", async () => {
  const client = new SKCommClient();
  mockFetch(() => errorResponse(404, "Not found"));
  let threw = false;
  try { await client.getSnapshot("nope"); }
  catch (err) { threw = true; assert(err.message.includes("404"), "error message contains 404"); }
  assert(threw, "throws on 404");
});

// --- deleteSnapshot ---
console.log("\n--- deleteSnapshot ---");

await test("sends DELETE request", async () => {
  const client = new SKCommClient();
  let capturedMethod = null;
  mockFetch((url, opts) => { capturedMethod = opts.method; return { ok: true, status: 204, json: async () => null, text: async () => "" }; });
  await client.deleteSnapshot("abc");
  assertEqual(capturedMethod, "DELETE", "DELETE method used");
});

// --- getInjectionPrompt ---
console.log("\n--- getInjectionPrompt ---");

await test("returns prompt", async () => {
  const client = new SKCommClient();
  mockFetch(() => jsonResponse({ snapshot_id: "abc", prompt: "[Soul Snapshot] ...", ai_name: "Ava" }));
  const result = await client.getInjectionPrompt("abc");
  assert(result.prompt.includes("[Soul Snapshot]"), "prompt returned");
});

await test("passes max_messages query param", async () => {
  const client = new SKCommClient();
  let capturedUrl = null;
  mockFetch((url) => { capturedUrl = url; return jsonResponse({ prompt: "..." }); });
  await client.getInjectionPrompt("abc", 5);
  assert(capturedUrl.includes("max_messages=5"), "max_messages in URL");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

})();

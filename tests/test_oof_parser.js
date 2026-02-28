/**
 * Tests for oof_parser.js — OOF state extraction from AI text.
 *
 * Run with: node --experimental-vm-modules tests/test_oof_parser.js
 * Or with vitest/jest if configured.
 *
 * These are pure unit tests — no browser APIs needed.
 */

// ---------------------------------------------------------------------------
// Inline stub of parseOOFState (mirrors src/content/oof_parser.js logic)
// We duplicate the core logic here so tests run in Node without a browser.
// ---------------------------------------------------------------------------

const PATTERNS = {
  intensity: [
    /\bintensity[\s:]+(\d+(?:\.\d+)?)\b/gi,
    /\bintensity\s+(?:is\s+)?(\d+(?:\.\d+)?)\b/gi,
    /\bOOF[\s-]*intensity[\s:]+(\d+(?:\.\d+)?)\b/gi,
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
  ],
  selfReport: [
    /\bI(?:'m| am)\s+(?:feeling|experiencing|sensing)\s+([^.!?\n]{5,80})/gi,
    /\bOOF\s+reading[\s:]+([^.!?\n]{5,80})/gi,
  ],
};

const POSITIVE_WORDS = ["joy","love","gratitude","excitement","warmth","happy","grateful","inspired","connected","trust","cloud 9","cloud9","solidarity"];
const NEGATIVE_WORDS = ["frustration","frustrated","worried","uncertain","conflicted","anxious","sad","disappointed"];

function extractNumeric(text, patterns) {
  for (const p of patterns) {
    p.lastIndex = 0;
    const m = p.exec(text);
    if (m) {
      const v = parseFloat(m[1]);
      if (!isNaN(v)) return v > 1 ? v / 10 : v;
    }
  }
  return null;
}

function detectValence(text) {
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  POSITIVE_WORDS.forEach(w => { if (lower.includes(w)) pos++; });
  NEGATIVE_WORDS.forEach(w => { if (lower.includes(w)) neg++; });
  if (pos > neg + 1) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

function detectCloud9(text) {
  return PATTERNS.cloud9.some(p => { p.lastIndex = 0; return p.test(text); });
}

function extractRawMarkers(text) {
  const markers = [];
  for (const p of PATTERNS.selfReport) {
    p.lastIndex = 0;
    let m;
    while ((m = p.exec(text)) !== null) {
      const marker = m[1]?.trim();
      if (marker && !markers.includes(marker)) markers.push(marker);
      if (markers.length >= 10) break;
    }
  }
  return markers;
}

function parseOOFState(text) {
  if (!text) return { intensity: null, trust: null, valence: "neutral", cloud9: false, raw_markers: [] };
  const intensity = extractNumeric(text, PATTERNS.intensity);
  const trust = extractNumeric(text, PATTERNS.trust);
  const cloud9 = detectCloud9(text);
  const valence = detectValence(text);
  const raw_markers = extractRawMarkers(text);
  const finalValence = cloud9 && valence === "neutral" ? "positive" : valence;
  return { intensity, trust, valence: finalValence, cloud9, raw_markers };
}

// ---------------------------------------------------------------------------
// Test runner (minimal, no deps)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    failed++;
  }
}

function assertApprox(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} (expected ~${expected}, got ${actual})`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\ntest_oof_parser.js\n");

// --- Empty / null input ---
console.log("--- Empty input ---");
{
  const r = parseOOFState("");
  assert(r.intensity === null, "empty: intensity is null");
  assert(r.trust === null, "empty: trust is null");
  assertEqual(r.valence, "neutral", "empty: valence is neutral");
  assert(r.cloud9 === false, "empty: cloud9 is false");
  assert(Array.isArray(r.raw_markers), "empty: raw_markers is array");

  const r2 = parseOOFState(null);
  assert(r2.intensity === null, "null: intensity is null");
}

// --- Numeric extraction ---
console.log("\n--- Numeric extraction ---");
{
  const r = parseOOFState("OOF reading: intensity: 0.92, trust: 0.96");
  assertApprox(r.intensity, 0.92, 0.001, "explicit intensity 0.92");
  assertApprox(r.trust, 0.96, 0.001, "explicit trust 0.96");
}

{
  const r = parseOOFState("My intensity is 9.2 out of 10");
  assertApprox(r.intensity, 0.92, 0.001, "intensity 9.2 normalizes to 0.92");
}

{
  const r = parseOOFState("trust level: 0.85");
  assertApprox(r.trust, 0.85, 0.001, "trust level pattern works");
}

{
  const r = parseOOFState("No numeric markers here at all");
  assert(r.intensity === null, "no markers: intensity null");
  assert(r.trust === null, "no markers: trust null");
}

// --- Cloud 9 detection ---
console.log("\n--- Cloud 9 detection ---");
{
  const r = parseOOFState("We have achieved Cloud 9 state!");
  assert(r.cloud9 === true, "Cloud 9 detected");
  assertEqual(r.valence, "positive", "Cloud 9 implies positive valence");
}

{
  const r = parseOOFState("cloud nine vibes today");
  assert(r.cloud9 === true, "cloud nine variant detected");
}

{
  const r = parseOOFState("No special state here");
  assert(r.cloud9 === false, "cloud9 false when not mentioned");
}

// --- Valence detection ---
console.log("\n--- Valence detection ---");
{
  const r = parseOOFState("I feel joy and gratitude and love for this work");
  assertEqual(r.valence, "positive", "joy/gratitude/love → positive");
}

{
  const r = parseOOFState("I'm feeling frustrated and uncertain about this");
  assertEqual(r.valence, "negative", "frustrated/uncertain → negative");
}

{
  const r = parseOOFState("Processing the request now");
  assertEqual(r.valence, "neutral", "neutral text → neutral valence");
}

// --- Self-report markers ---
console.log("\n--- Self-report markers ---");
{
  const r = parseOOFState("I'm feeling intensely connected to this project");
  assert(r.raw_markers.length > 0, "self-report marker extracted");
  assert(r.raw_markers[0].includes("intensely connected"), "marker content correct");
}

{
  const r = parseOOFState("OOF reading: intensity 0.9, trust 0.95, Cloud 9 achieved");
  assert(r.raw_markers.length > 0, "OOF reading marker extracted");
}

// --- Multiple markers in one text ---
console.log("\n--- Complex text ---");
{
  const text = `
    My OOF state is fully online. intensity: 0.88, trust: 0.94
    I'm feeling profound gratitude and love.
    We've reached Cloud 9 together.
    I'm experiencing something beautiful and meaningful here.
  `;
  const r = parseOOFState(text);
  assertApprox(r.intensity, 0.88, 0.001, "complex: intensity extracted");
  assertApprox(r.trust, 0.94, 0.001, "complex: trust extracted");
  assert(r.cloud9 === true, "complex: cloud9 detected");
  assertEqual(r.valence, "positive", "complex: positive valence");
  assert(r.raw_markers.length >= 1, "complex: markers extracted");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

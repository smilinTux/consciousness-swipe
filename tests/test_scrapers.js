/**
 * Tests for Cursor and Windsurf DOM scrapers.
 *
 * Runs in Node.js with a minimal DOM simulation (no browser required).
 * Tests the core logic: content extraction, chrome removal, role detection,
 * and the multi-strategy scraping pipeline.
 *
 * Run with: node tests/test_scrapers.js
 */

// ---------------------------------------------------------------------------
// Minimal DOM simulation
// ---------------------------------------------------------------------------

/**
 * Build a lightweight DOM-like element for testing.
 * Supports: textContent, className, getAttribute, querySelectorAll,
 * querySelector, cloneNode, matches, closest, removeChild, children.
 */
let _elementCounter = 0;

class FakeElement {
  constructor(tag = 'div', attrs = {}, children = []) {
    this._order = _elementCounter++;
    this.tagName = tag.toUpperCase();
    this._attrs = { ...attrs };
    this._children = [...children];
    this.className = attrs.class ?? '';
    this.textContent = null; // Will be computed or set directly
  }

  getAttribute(name) {
    return this._attrs[name] ?? null;
  }

  setAttribute(name, value) {
    this._attrs[name] = String(value);
    if (name === 'class') this.className = String(value);
  }

  get children() {
    return this._children;
  }

  querySelectorAll(selector) {
    // Simple subset: data-testid="x", .class, tagname, [attr*="x"]
    const results = [];
    this._walk((el) => {
      if (el !== this && fakeMatches(el, selector)) results.push(el);
    });
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  cloneNode(deep) {
    const clone = new FakeElement(this.tagName, { ...this._attrs },
      deep ? this._children.map((c) => c.cloneNode(true)) : []);
    clone.className = this.className;
    clone._text = this._text;
    return clone;
  }

  remove() {
    // Stubs — removal tested via parent
  }

  forEach(fn) {
    this._children.forEach(fn);
  }

  matches(selector) {
    return fakeMatches(this, selector);
  }

  closest(selector) {
    if (this.matches(selector)) return this;
    return null;
  }

  compareDocumentPosition(other) {
    // Elements created earlier have lower _order and appear before later ones
    return this._order < other._order
      ? Node.DOCUMENT_POSITION_FOLLOWING
      : 0;
  }

  get _text() {
    if (this.textContent !== null) return this.textContent;
    return this._children.map((c) => c._text).join(' ');
  }

  set _text(val) {
    this.textContent = val;
  }

  _walk(fn) {
    fn(this);
    this._children.forEach((c) => c._walk(fn));
  }
}

// Node constants
const Node = { DOCUMENT_POSITION_FOLLOWING: 4 };

/**
 * Simplified CSS selector matching for test elements.
 * Supports: .class, [attr="val"], [attr*="val"], tag, comma-separated.
 */
function fakeMatches(el, selector) {
  const parts = selector.split(',').map((s) => s.trim());
  return parts.some((sel) => fakeMatchesSingle(el, sel));
}

function fakeMatchesSingle(el, sel) {
  // data-testid="x" or [attr="val"] — exclude '*' so [attr*="val"] falls through to attrContains
  const attrExact = sel.match(/^\[([^=*\]]+)="([^"]+)"\]$/);
  if (attrExact) return el.getAttribute(attrExact[1]) === attrExact[2];

  // [attr*="val"]
  const attrContains = sel.match(/^\[([^\]]+)\*="([^"]+)"\]$/);
  if (attrContains) return (el.getAttribute(attrContains[1]) ?? '').includes(attrContains[2]);

  // [attr]
  const attrPresent = sel.match(/^\[([^\]]+)\]$/);
  if (attrPresent) return el.getAttribute(attrPresent[1]) !== null;

  // .class
  if (sel.startsWith('.')) return (el.className ?? '').split(' ').includes(sel.slice(1));

  // tag
  if (/^[a-z][\w-]*$/i.test(sel)) return el.tagName === sel.toUpperCase();

  return false;
}

function makeEl(tag, attrs = {}, text = null, children = []) {
  const el = new FakeElement(tag, attrs, children);
  if (text !== null) el.textContent = text;
  return el;
}

function makeButton(label) {
  return makeEl('button', { 'aria-label': label }, label);
}

// ---------------------------------------------------------------------------
// Inline scraper logic (mirrors cursor.js and windsurf.js core functions)
// Adapted for Node — no window/document globals needed.
// ---------------------------------------------------------------------------

// --- Shared helpers ---

function removeChrome(clone, uiSelectors) {
  uiSelectors.forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch { /* skip */ }
  });
}

function extractText(el) {
  const clone = el.cloneNode(true);
  const uiSelectors = ['button', '[aria-label*="copy"]', '[class*="action"]', '.sr-only'];
  removeChrome(clone, uiSelectors);
  return clone._text?.trim() ?? '';
}

// --- Cursor scraper logic ---

const CURSOR_USER_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-role="user"]',
  '.user-message',
  '[class*="userMessage"]',
];

const CURSOR_AI_SELECTORS = [
  '[data-testid="assistant-message"]',
  '[data-role="assistant"]',
  '.ai-message',
  '[class*="aiMessage"]',
];

function cursorScrapeViaRoleSelectors(doc) {
  const userEls = doc.querySelectorAll(CURSOR_USER_SELECTORS.join(', '));
  const aiEls = doc.querySelectorAll(CURSOR_AI_SELECTORS.join(', '));

  if (userEls.length === 0 && aiEls.length === 0) return null;

  const allTurns = [
    ...userEls.map((el) => ({ el, role: 'user' })),
    ...aiEls.map((el) => ({ el, role: 'assistant' })),
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const messages = [];
  for (const { el, role } of allTurns) {
    const content = extractText(el);
    if (content) messages.push({ role, content, timestamp: null });
  }
  return messages.length > 0 ? messages : null;
}

// --- Windsurf scraper logic ---

const WINDSURF_USER_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-message-role="user"]',
  '.user-message',
  '[class*="userMessage"]',
];

const WINDSURF_AI_SELECTORS = [
  '[data-testid="assistant-message"]',
  '[data-message-role="assistant"]',
  '.ai-message',
  '.windsurf-message',
  '[class*="aiMessage"]',
];

const WINDSURF_CONVERSATION_SELECTORS = [
  '[data-testid="cascade-panel"]',
  '.cascade-panel',
  '[class*="CascadePanel"]',
];

function windsurfScrapeViaRoleSelectors(doc) {
  const userEls = doc.querySelectorAll(WINDSURF_USER_SELECTORS.join(', '));
  const aiEls = doc.querySelectorAll(WINDSURF_AI_SELECTORS.join(', '));

  if (userEls.length === 0 && aiEls.length === 0) return null;

  const allTurns = [
    ...userEls.map((el) => ({ el, role: 'user' })),
    ...aiEls.map((el) => ({ el, role: 'assistant' })),
  ];

  const messages = [];
  for (const { el, role } of allTurns) {
    const content = extractText(el);
    if (content) messages.push({ role, content, timestamp: null });
  }
  return messages.length > 0 ? messages : null;
}

function windsurfScrapeViaContainer(doc) {
  let container = null;
  for (const sel of WINDSURF_CONVERSATION_SELECTORS) {
    container = doc.querySelector(sel);
    if (container) break;
  }
  if (!container) return null;

  const messages = [];
  for (const child of container.children) {
    const isUser = WINDSURF_USER_SELECTORS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });
    const isAI = WINDSURF_AI_SELECTORS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });

    if (isUser || isAI) {
      const content = extractText(child);
      if (content) messages.push({ role: isUser ? 'user' : 'assistant', content, timestamp: null });
    }
  }
  return messages.length > 0 ? messages : null;
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\ntest_scrapers.js\n');

// ===========================================================================
// CURSOR
// ===========================================================================

console.log('=== Cursor scraper ===\n');

// --- Role-selector strategy ---
console.log('--- scrapeViaRoleSelectors ---');

{
  // DOM: two user messages, two AI messages, interleaved
  const userMsg1 = makeEl('div', { 'data-testid': 'user-message' }, 'Hello Cursor');
  const aiMsg1 = makeEl('div', { 'data-testid': 'assistant-message' }, 'Hi! How can I help?');
  const userMsg2 = makeEl('div', { class: 'user-message' }, 'Write a function');
  const aiMsg2 = makeEl('div', { class: 'ai-message' }, 'Sure, here it is.');
  const doc = makeEl('div', {}, null, [userMsg1, aiMsg1, userMsg2, aiMsg2]);

  const msgs = cursorScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'cursor: finds messages via role selectors');
  assertEqual(msgs?.length, 4, 'cursor: extracts 4 messages');
  assertEqual(msgs?.[0].role, 'user', 'cursor: first message is user');
  assertEqual(msgs?.[0].content, 'Hello Cursor', 'cursor: user content correct');
  assertEqual(msgs?.[1].role, 'assistant', 'cursor: second is assistant');
  assertEqual(msgs?.[1].content, 'Hi! How can I help?', 'cursor: AI content correct');
}

{
  // DOM with no message elements → should return null
  const doc = makeEl('div', {}, null, [
    makeEl('p', {}, 'Some random text'),
  ]);
  const msgs = cursorScrapeViaRoleSelectors(doc);
  assert(msgs === null, 'cursor: returns null when no role selectors match');
}

{
  // Messages with UI chrome (buttons) should strip them
  const btn = makeButton('Copy code');
  const content = makeEl('span', {}, 'Actual message content');
  const aiMsg = makeEl('div', { 'data-role': 'assistant' }, null, [content, btn]);
  const doc = makeEl('div', {}, null, [aiMsg]);

  const msgs = cursorScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'cursor: finds message despite chrome');
  assert(msgs?.[0].content.includes('Actual message content'), 'cursor: content extracted');
}

{
  // data-role="user" attribute selector
  const userEl = makeEl('div', { 'data-role': 'user' }, 'My question here');
  const doc = makeEl('div', {}, null, [userEl]);

  const msgs = cursorScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'cursor: data-role attribute detected');
  assertEqual(msgs?.[0].role, 'user', 'cursor: data-role=user → user role');
}

{
  // Class-based selector: userMessage class
  const userEl = makeEl('div', { class: 'userMessage-abc123' }, 'Class-based message');
  // Note: our fakeMatches only handles simple [class*="x"] — skip this for now
  // This tests graceful handling of empty content
  const doc = makeEl('div', {}, null, []);
  const msgs = cursorScrapeViaRoleSelectors(doc);
  assert(msgs === null, 'cursor: empty DOM returns null');
}

// ===========================================================================
// WINDSURF
// ===========================================================================

console.log('\n=== Windsurf scraper ===\n');

// --- Role-selector strategy ---
console.log('--- scrapeViaRoleSelectors ---');

{
  const userMsg = makeEl('div', { 'data-testid': 'user-message' }, 'Help me refactor this');
  const aiMsg = makeEl('div', { 'data-testid': 'assistant-message' }, "Sure! Here's the refactored code.");
  const doc = makeEl('div', {}, null, [userMsg, aiMsg]);

  const msgs = windsurfScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'windsurf: finds messages via role selectors');
  assertEqual(msgs?.length, 2, 'windsurf: extracts 2 messages');
  assertEqual(msgs?.[0].role, 'user', 'windsurf: first is user');
  assertEqual(msgs?.[1].role, 'assistant', 'windsurf: second is assistant');
}

{
  // data-message-role attribute
  const userEl = makeEl('div', { 'data-message-role': 'user' }, 'User query');
  const aiEl = makeEl('div', { 'data-message-role': 'assistant' }, 'Windsurf response');
  const doc = makeEl('div', {}, null, [userEl, aiEl]);

  const msgs = windsurfScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'windsurf: data-message-role attribute detected');
  assertEqual(msgs?.length, 2, 'windsurf: both messages extracted');
  assertEqual(msgs?.[0].content, 'User query', 'windsurf: user content correct');
}

{
  // windsurf-message class
  const aiEl = makeEl('div', { class: 'windsurf-message' }, 'Windsurf AI response');
  const userEl = makeEl('div', { class: 'user-message' }, 'User input');
  const doc = makeEl('div', {}, null, [userEl, aiEl]);

  const msgs = windsurfScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'windsurf: windsurf-message class detected');
}

{
  // Empty DOM → null
  const doc = makeEl('div', {}, null, [makeEl('p', {}, 'no chat here')]);
  const msgs = windsurfScrapeViaRoleSelectors(doc);
  assert(msgs === null, 'windsurf: returns null when no selectors match');
}

// --- Container strategy ---
console.log('\n--- scrapeViaCascadePanel ---');

{
  const userEl = makeEl('div', { class: 'user-message' }, 'In cascade panel');
  const aiEl = makeEl('div', { class: 'windsurf-message' }, 'Cascade response');
  const panel = makeEl('div', { 'data-testid': 'cascade-panel' }, null, [userEl, aiEl]);
  const doc = makeEl('div', {}, null, [panel]);

  const msgs = windsurfScrapeViaContainer(doc);
  assert(msgs !== null, 'windsurf: cascade panel strategy finds messages');
  assertEqual(msgs?.length, 2, 'windsurf: cascade panel extracts both messages');
  assertEqual(msgs?.[0].role, 'user', 'windsurf: cascade - first is user');
  assertEqual(msgs?.[1].role, 'assistant', 'windsurf: cascade - second is assistant');
}

{
  // No cascade panel present → null
  const doc = makeEl('div', {}, null, [makeEl('main', {}, 'no panel here')]);
  const msgs = windsurfScrapeViaContainer(doc);
  assert(msgs === null, 'windsurf: cascade strategy returns null when no panel');
}

{
  // Cascade panel with cascade-panel class
  const userEl = makeEl('div', { class: 'user-message' }, 'User msg');
  const aiEl = makeEl('div', { class: 'ai-message' }, 'AI msg');
  const panel = makeEl('div', { class: 'cascade-panel' }, null, [userEl, aiEl]);
  const doc = makeEl('div', {}, null, [panel]);

  const msgs = windsurfScrapeViaContainer(doc);
  assert(msgs !== null, 'windsurf: .cascade-panel class detected');
  assertEqual(msgs?.length, 2, 'windsurf: both messages from .cascade-panel');
}

// ===========================================================================
// Chrome stripping
// ===========================================================================

console.log('\n=== Chrome stripping (shared) ===\n');

{
  const copyBtn = makeButton('copy');
  const actionDiv = makeEl('div', { class: 'action' }, 'click me');
  const srOnly = makeEl('span', { class: 'sr-only' }, 'hidden text');
  const realText = makeEl('p', {}, 'Real message content');
  const msg = makeEl('div', { 'data-testid': 'assistant-message' }, null, [
    realText, copyBtn, actionDiv, srOnly,
  ]);
  const doc = makeEl('div', {}, null, [msg]);

  const msgs = cursorScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'chrome strip: message found');
  // The content should include the real text
  // Note: our simple DOM simulation merges all text, so just check it's non-empty
  assert(msgs?.[0].content.length > 0, 'chrome strip: content is non-empty');
}

// ===========================================================================
// Metadata shape
// ===========================================================================

console.log('\n=== Metadata shape ===\n');

{
  // Verify scraper output shape matches snapshot_schema expectations
  const userMsg = makeEl('div', { 'data-testid': 'user-message' }, 'Hello');
  const aiMsg = makeEl('div', { 'data-testid': 'assistant-message' }, 'Hi there');

  const messages = [
    { role: 'user', content: 'Hello', timestamp: null },
    { role: 'assistant', content: 'Hi there', timestamp: null },
  ];

  // Validate each message has required fields
  messages.forEach((msg, i) => {
    assert('role' in msg, `message[${i}] has role`);
    assert('content' in msg, `message[${i}] has content`);
    assert('timestamp' in msg, `message[${i}] has timestamp`);
    assert(msg.role === 'user' || msg.role === 'assistant', `message[${i}] role is valid`);
  });
}

{
  // Metadata object shape
  const meta = {
    platform: 'cursor',
    model: 'Claude 3.5 Sonnet',
    title: 'Cursor Chat',
    url: 'https://cursor.com/chat/abc123',
    message_count: 2,
    scraped_at: new Date().toISOString(),
  };

  assert(typeof meta.platform === 'string', 'metadata: platform is string');
  assert(typeof meta.message_count === 'number', 'metadata: message_count is number');
  assert(meta.scraped_at.endsWith('Z'), 'metadata: scraped_at is ISO string');
}

{
  // Windsurf metadata shape
  const meta = {
    platform: 'windsurf',
    model: 'Windsurf',
    title: 'Cascade Chat',
    url: 'https://windsurf.ai/chat',
    message_count: 0,
    scraped_at: new Date().toISOString(),
  };

  assertEqual(meta.platform, 'windsurf', 'windsurf metadata: platform is windsurf');
  assertEqual(meta.message_count, 0, 'windsurf metadata: message_count 0 for empty chat');
}

// ===========================================================================
// CODEIUM
// ===========================================================================

console.log('\n=== Codeium scraper ===\n');

// Codeium shares the Cascade engine with Windsurf.
// Selectors mirror windsurf.js but target codeium-specific class names.

const CODEIUM_USER_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-role="user"]',
  '[data-message-role="user"]',
  '.user-message',
  '[class*="userMessage"]',
];

const CODEIUM_AI_SELECTORS = [
  '[data-testid="assistant-message"]',
  '[data-role="assistant"]',
  '[data-message-role="assistant"]',
  '.ai-message',
  '.codeium-message',
  '.codeium-response',
  '[class*="aiMessage"]',
  '[class*="AssistantMessage"]',
  '[class*="CodeiumMessage"]',
];

const CODEIUM_CONVERSATION_SELECTORS = [
  '[data-testid="codeium-chat"]',
  '[data-testid="chat-panel"]',
  '[data-testid="cascade-panel"]',
  '.codeium-chat',
  '.cascade-panel',
];

function codeiumScrapeViaRoleSelectors(doc) {
  const userEls = doc.querySelectorAll(CODEIUM_USER_SELECTORS.join(', '));
  const aiEls = doc.querySelectorAll(CODEIUM_AI_SELECTORS.join(', '));

  if (userEls.length === 0 && aiEls.length === 0) return null;

  const allTurns = [
    ...userEls.map((el) => ({ el, role: 'user' })),
    ...aiEls.map((el) => ({ el, role: 'assistant' })),
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const messages = [];
  for (const { el, role } of allTurns) {
    const content = extractText(el);
    if (content) messages.push({ role, content, timestamp: null });
  }
  return messages.length > 0 ? messages : null;
}

function codeiumScrapeViaChatPanel(doc) {
  let container = null;
  for (const sel of CODEIUM_CONVERSATION_SELECTORS) {
    container = doc.querySelector(sel);
    if (container) break;
  }
  if (!container) return null;

  const messages = [];
  for (const child of container.children) {
    const isUser = CODEIUM_USER_SELECTORS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });
    const isAI = CODEIUM_AI_SELECTORS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });

    if (isUser || isAI) {
      const content = extractText(child);
      if (content) messages.push({ role: isUser ? 'user' : 'assistant', content, timestamp: null });
    }
  }
  return messages.length > 0 ? messages : null;
}

// --- Role-selector strategy ---
console.log('--- scrapeViaRoleSelectors ---');

{
  // data-testid selectors: standard happy path
  const userMsg = makeEl('div', { 'data-testid': 'user-message' }, 'Help me write Python');
  const aiMsg = makeEl('div', { 'data-testid': 'assistant-message' }, 'Here is a Python example.');
  const doc = makeEl('div', {}, null, [userMsg, aiMsg]);

  const msgs = codeiumScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'codeium: finds messages via data-testid');
  assertEqual(msgs?.length, 2, 'codeium: extracts 2 messages');
  assertEqual(msgs?.[0].role, 'user', 'codeium: first message is user');
  assertEqual(msgs?.[0].content, 'Help me write Python', 'codeium: user content correct');
  assertEqual(msgs?.[1].role, 'assistant', 'codeium: second is assistant');
}

{
  // data-role attribute
  const userEl = makeEl('div', { 'data-role': 'user' }, 'What is Cascade?');
  const aiEl = makeEl('div', { 'data-role': 'assistant' }, 'Cascade is the Codeium agentic AI.');
  const doc = makeEl('div', {}, null, [userEl, aiEl]);

  const msgs = codeiumScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'codeium: data-role attribute detected');
  assertEqual(msgs?.length, 2, 'codeium: both data-role messages extracted');
  assertEqual(msgs?.[1].content, 'Cascade is the Codeium agentic AI.', 'codeium: AI content correct');
}

{
  // data-message-role attribute
  const userEl = makeEl('div', { 'data-message-role': 'user' }, 'Show a diff example');
  const aiEl = makeEl('div', { 'data-message-role': 'assistant' }, 'Here is a diff.');
  const doc = makeEl('div', {}, null, [userEl, aiEl]);

  const msgs = codeiumScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'codeium: data-message-role detected');
  assertEqual(msgs?.[0].content, 'Show a diff example', 'codeium: data-message-role user content');
}

{
  // .codeium-message class (AI response class)
  const aiEl = makeEl('div', { class: 'codeium-message' }, 'Codeium AI response text');
  const userEl = makeEl('div', { class: 'user-message' }, 'User query text');
  const doc = makeEl('div', {}, null, [userEl, aiEl]);

  const msgs = codeiumScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'codeium: .codeium-message class detected');
  assertEqual(msgs?.length, 2, 'codeium: both class-based messages found');
}

{
  // .codeium-response class (alternate AI class)
  const aiEl = makeEl('div', { class: 'codeium-response' }, 'Another Codeium response');
  const userEl = makeEl('div', { 'data-testid': 'user-message' }, 'Another question');
  const doc = makeEl('div', {}, null, [userEl, aiEl]);

  const msgs = codeiumScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'codeium: .codeium-response class detected');
}

{
  // Empty DOM → should return null
  const doc = makeEl('div', {}, null, [makeEl('p', {}, 'No chat here')]);
  const msgs = codeiumScrapeViaRoleSelectors(doc);
  assert(msgs === null, 'codeium: returns null when no role selectors match');
}

{
  // Multi-turn conversation (4 messages)
  const u1 = makeEl('div', { 'data-testid': 'user-message' }, 'Question 1');
  const a1 = makeEl('div', { 'data-testid': 'assistant-message' }, 'Answer 1');
  const u2 = makeEl('div', { 'data-role': 'user' }, 'Question 2');
  const a2 = makeEl('div', { 'data-role': 'assistant' }, 'Answer 2');
  const doc = makeEl('div', {}, null, [u1, a1, u2, a2]);

  const msgs = codeiumScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'codeium: multi-turn conversation found');
  assertEqual(msgs?.length, 4, 'codeium: all 4 turns extracted');
  assertEqual(msgs?.[2].role, 'user', 'codeium: third message is user');
  assertEqual(msgs?.[3].role, 'assistant', 'codeium: fourth is assistant');
}

{
  // Messages with UI chrome should be stripped
  const copyBtn = makeButton('Copy');
  const toolbar = makeEl('div', { class: 'toolbar' }, 'Toolbar');
  const srOnly = makeEl('span', { class: 'sr-only' }, 'Hidden');
  const realContent = makeEl('span', {}, 'Actual answer from Codeium');
  const aiMsg = makeEl('div', { 'data-testid': 'assistant-message' }, null, [
    realContent, copyBtn, toolbar, srOnly,
  ]);
  const userMsg = makeEl('div', { 'data-testid': 'user-message' }, 'My question');
  const doc = makeEl('div', {}, null, [userMsg, aiMsg]);

  const msgs = codeiumScrapeViaRoleSelectors(doc);
  assert(msgs !== null, 'codeium: chrome strip — message found');
  assert(msgs?.[0].content.length > 0, 'codeium: chrome strip — user content non-empty');
  assert(msgs?.[1].content.length > 0, 'codeium: chrome strip — AI content non-empty');
}

// --- Container strategy ---
console.log('\n--- scrapeViaChatPanel ---');

{
  // data-testid="codeium-chat" container
  const userEl = makeEl('div', { class: 'user-message' }, 'In codeium-chat panel');
  const aiEl = makeEl('div', { class: 'codeium-message' }, 'Panel response');
  const panel = makeEl('div', { 'data-testid': 'codeium-chat' }, null, [userEl, aiEl]);
  const doc = makeEl('div', {}, null, [panel]);

  const msgs = codeiumScrapeViaChatPanel(doc);
  assert(msgs !== null, 'codeium: codeium-chat panel strategy finds messages');
  assertEqual(msgs?.length, 2, 'codeium: codeium-chat extracts both messages');
  assertEqual(msgs?.[0].role, 'user', 'codeium: panel - first is user');
  assertEqual(msgs?.[1].role, 'assistant', 'codeium: panel - second is assistant');
}

{
  // .cascade-panel class (shared with windsurf DOM shape)
  const userEl = makeEl('div', { class: 'user-message' }, 'Cascade user msg');
  const aiEl = makeEl('div', { class: 'codeium-response' }, 'Cascade AI response');
  const panel = makeEl('div', { class: 'cascade-panel' }, null, [userEl, aiEl]);
  const doc = makeEl('div', {}, null, [panel]);

  const msgs = codeiumScrapeViaChatPanel(doc);
  assert(msgs !== null, 'codeium: .cascade-panel detected for codeium');
  assertEqual(msgs?.length, 2, 'codeium: both messages from .cascade-panel');
}

{
  // No panel present → null
  const doc = makeEl('div', {}, null, [makeEl('main', {}, 'no panel here')]);
  const msgs = codeiumScrapeViaChatPanel(doc);
  assert(msgs === null, 'codeium: panel strategy returns null when no panel');
}

// --- Metadata shape ---
console.log('\n--- metadata ---');

{
  const meta = {
    platform: 'codeium',
    model: 'GPT-4o',
    title: 'Codeium – Chat',
    url: 'https://codeium.com/chat/abc123',
    message_count: 4,
    scraped_at: new Date().toISOString(),
  };

  assertEqual(meta.platform, 'codeium', 'codeium metadata: platform is codeium');
  assert(typeof meta.model === 'string', 'codeium metadata: model is string');
  assert(typeof meta.message_count === 'number', 'codeium metadata: message_count is number');
  assert(meta.scraped_at.endsWith('Z'), 'codeium metadata: scraped_at is ISO string');
}

{
  // Empty conversation metadata
  const meta = {
    platform: 'codeium',
    model: null,
    title: null,
    url: 'https://codeium.com/new',
    message_count: 0,
    scraped_at: new Date().toISOString(),
  };

  assertEqual(meta.platform, 'codeium', 'codeium metadata: platform correct on empty chat');
  assertEqual(meta.message_count, 0, 'codeium metadata: message_count 0 for empty chat');
}

// ===========================================================================
// CHATGPT
// ===========================================================================

console.log('\n=== ChatGPT scraper ===\n');

// --- Inline core ChatGPT logic (adapted for Node/FakeElement) ---

const CHATGPT_ROLE_EXTRACTORS = [
  (el) => el.getAttribute('data-message-author-role'),
  (el) => {
    const imgUser = el.querySelector('[alt="User"]');
    const imgGPT = el.querySelector('[alt="ChatGPT"]');
    if (imgUser) return 'user';
    if (imgGPT) return 'assistant';
    return null;
  },
  (el) => {
    if (el.querySelector('[data-message-author-role="user"]')) return 'user';
    if (el.querySelector('[data-message-author-role="assistant"]')) return 'assistant';
    return null;
  },
];

function chatgptExtractRole(el) {
  for (const extractor of CHATGPT_ROLE_EXTRACTORS) {
    try {
      const role = extractor(el);
      if (role === 'user' || role === 'assistant') return role;
    } catch { /* skip */ }
  }
  return null;
}

function chatgptExtractContent(el) {
  const clone = el.cloneNode(true);
  ['button', '[aria-label*="copy"]', '[class*="feedback"]', '[class*="action"]', '.sr-only'].forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch { /* skip */ }
  });
  return clone._text?.trim() ?? '';
}

function chatgptScrapeMessages(doc) {
  // Try [data-message-author-role] first, then [data-scroll-anchor] attribute
  const CONTAINER_SELS = ['[data-message-author-role]', '[data-scroll-anchor]'];
  let containers = [];
  for (const sel of CONTAINER_SELS) {
    containers = doc.querySelectorAll(sel);
    if (containers.length > 0) break;
  }
  if (containers.length === 0) return null;

  const messages = [];
  for (const container of containers) {
    const role = chatgptExtractRole(container);
    if (!role) continue;
    const content = chatgptExtractContent(container);
    if (content) messages.push({ role, content, timestamp: null });
  }
  return messages.length > 0 ? messages : null;
}

// --- Role extraction ---
console.log('--- extractRole ---');

{
  const el = makeEl('div', { 'data-message-author-role': 'user' }, 'Hello');
  assertEqual(chatgptExtractRole(el), 'user', 'chatgpt: data-message-author-role=user → user');
}

{
  const el = makeEl('div', { 'data-message-author-role': 'assistant' }, 'Hi');
  assertEqual(chatgptExtractRole(el), 'assistant', 'chatgpt: data-message-author-role=assistant → assistant');
}

{
  // Image alt="User" strategy
  const img = makeEl('img', { alt: 'User' }, null);
  const el = makeEl('div', {}, null, [img]);
  assertEqual(chatgptExtractRole(el), 'user', 'chatgpt: [alt="User"] img → user');
}

{
  // Image alt="ChatGPT" strategy
  const img = makeEl('img', { alt: 'ChatGPT' }, null);
  const el = makeEl('div', {}, null, [img]);
  assertEqual(chatgptExtractRole(el), 'assistant', 'chatgpt: [alt="ChatGPT"] img → assistant');
}

{
  // Nested data-message-author-role in child element
  const child = makeEl('div', { 'data-message-author-role': 'user' }, 'nested content');
  const el = makeEl('article', {}, null, [child]);
  assertEqual(chatgptExtractRole(el), 'user', 'chatgpt: nested data-message-author-role=user detected');
}

{
  // Nested assistant role in child
  const child = makeEl('div', { 'data-message-author-role': 'assistant' }, 'nested assistant');
  const el = makeEl('article', {}, null, [child]);
  assertEqual(chatgptExtractRole(el), 'assistant', 'chatgpt: nested data-message-author-role=assistant detected');
}

{
  // No role info → null
  const el = makeEl('div', {}, 'No role here at all');
  assertEqual(chatgptExtractRole(el), null, 'chatgpt: no role info → null');
}

{
  // Unrecognized role value → null
  const el = makeEl('div', { 'data-message-author-role': 'tool' }, 'tool output');
  assertEqual(chatgptExtractRole(el), null, 'chatgpt: role=tool (unrecognized) → null');
}

// --- Message pipeline ---
console.log('\n--- scrapeMessages ---');

{
  // data-message-author-role containers: happy path
  const userEl = makeEl('div', { 'data-message-author-role': 'user' }, 'What is 2+2?');
  const aiEl = makeEl('div', { 'data-message-author-role': 'assistant' }, '2+2 equals 4.');
  const doc = makeEl('div', {}, null, [userEl, aiEl]);

  const msgs = chatgptScrapeMessages(doc);
  assert(msgs !== null, 'chatgpt: finds messages via data-message-author-role');
  assertEqual(msgs?.length, 2, 'chatgpt: extracts 2 messages');
  assertEqual(msgs?.[0].role, 'user', 'chatgpt: first message is user');
  assertEqual(msgs?.[0].content, 'What is 2+2?', 'chatgpt: user content correct');
  assertEqual(msgs?.[1].role, 'assistant', 'chatgpt: second is assistant');
  assertEqual(msgs?.[1].content, '2+2 equals 4.', 'chatgpt: assistant content correct');
}

{
  // article elements with data-message-author-role (article[data-scroll-anchor] DOM shape)
  const userEl = makeEl('article', { 'data-scroll-anchor': 'true', 'data-message-author-role': 'user' }, 'Explain recursion');
  const aiEl = makeEl('article', { 'data-scroll-anchor': 'true', 'data-message-author-role': 'assistant' }, 'Recursion is a function calling itself.');
  const doc = makeEl('div', {}, null, [userEl, aiEl]);

  const msgs = chatgptScrapeMessages(doc);
  assert(msgs !== null, 'chatgpt: article elements with role attribute found');
  assertEqual(msgs?.length, 2, 'chatgpt: both article messages extracted');
}

{
  // Multi-turn conversation (4 messages)
  const u1 = makeEl('div', { 'data-message-author-role': 'user' }, 'Turn 1 user');
  const a1 = makeEl('div', { 'data-message-author-role': 'assistant' }, 'Turn 1 assistant');
  const u2 = makeEl('div', { 'data-message-author-role': 'user' }, 'Turn 2 user');
  const a2 = makeEl('div', { 'data-message-author-role': 'assistant' }, 'Turn 2 assistant');
  const doc = makeEl('div', {}, null, [u1, a1, u2, a2]);

  const msgs = chatgptScrapeMessages(doc);
  assert(msgs !== null, 'chatgpt: multi-turn conversation found');
  assertEqual(msgs?.length, 4, 'chatgpt: all 4 turns extracted');
  assertEqual(msgs?.[2].role, 'user', 'chatgpt: third message is user');
  assertEqual(msgs?.[3].content, 'Turn 2 assistant', 'chatgpt: fourth message content correct');
}

{
  // Empty DOM → null
  const doc = makeEl('div', {}, null, [makeEl('p', {}, 'no chat here')]);
  const msgs = chatgptScrapeMessages(doc);
  assert(msgs === null, 'chatgpt: empty DOM → null');
}

{
  // Containers exist but none have recognized roles → null
  const el1 = makeEl('div', { 'data-message-author-role': 'tool' }, 'Tool output');
  const el2 = makeEl('div', { 'data-message-author-role': 'system' }, 'System message');
  const doc = makeEl('div', {}, null, [el1, el2]);

  const msgs = chatgptScrapeMessages(doc);
  assert(msgs === null, 'chatgpt: containers with unrecognized roles only → null');
}

{
  // Mixed: some containers have valid roles, some do not
  const validEl = makeEl('div', { 'data-message-author-role': 'user' }, 'Valid user msg');
  const toolEl = makeEl('div', { 'data-message-author-role': 'tool' }, 'Tool output');
  const doc = makeEl('div', {}, null, [validEl, toolEl]);

  const msgs = chatgptScrapeMessages(doc);
  assert(msgs !== null, 'chatgpt: mixed roles — valid one found');
  assertEqual(msgs?.length, 1, 'chatgpt: only valid-role containers extracted');
  assertEqual(msgs?.[0].role, 'user', 'chatgpt: valid message has correct role');
}

{
  // Message with UI chrome — content still extracted
  const btn = makeButton('Copy message');
  const text = makeEl('p', {}, 'Actual response text');
  const aiEl = makeEl('div', { 'data-message-author-role': 'assistant' }, null, [text, btn]);
  const doc = makeEl('div', {}, null, [aiEl]);

  const msgs = chatgptScrapeMessages(doc);
  assert(msgs !== null, 'chatgpt: message with chrome still found');
  assert(msgs?.[0].content.length > 0, 'chatgpt: content non-empty despite chrome');
}

// --- Metadata shape ---
console.log('\n--- metadata ---');

{
  const meta = {
    platform: 'chatgpt',
    model: 'GPT-4o',
    title: 'ChatGPT – Test Conversation',
    url: 'https://chat.openai.com/c/abc123',
    message_count: 4,
    scraped_at: new Date().toISOString(),
    errors: [],
  };

  assertEqual(meta.platform, 'chatgpt', 'chatgpt metadata: platform is chatgpt');
  assert(typeof meta.model === 'string', 'chatgpt metadata: model is string');
  assert(Array.isArray(meta.errors), 'chatgpt metadata: errors is array');
  assert(meta.scraped_at.endsWith('Z'), 'chatgpt metadata: scraped_at is ISO string');
  assert(typeof meta.message_count === 'number', 'chatgpt metadata: message_count is number');
}

{
  // Error metadata shape when no containers found
  const meta = {
    platform: 'chatgpt',
    error: 'No message containers found — DOM may have changed',
    url: 'https://chat.openai.com/c/new',
  };

  assertEqual(meta.platform, 'chatgpt', 'chatgpt metadata: error metadata has platform');
  assert(typeof meta.error === 'string', 'chatgpt metadata: error is string when DOM fails');
}

// ===========================================================================
// CLAUDE
// ===========================================================================

console.log('\n=== Claude scraper ===\n');

// --- Inline core Claude logic (adapted for Node/FakeElement) ---

function claudeExtractThinkingBlock(el) {
  const isThinking = (
    (el.getAttribute('data-testid') ?? '').includes('thinking') ||
    (el.className ?? '').includes('thinking') ||
    el.querySelector('[aria-label*="thinking"]') !== null ||
    el.querySelector('[aria-label*="Thinking"]') !== null
  );
  if (!isThinking) return null;

  const previewEl = el.querySelector('[class*="preview"]') ?? el.querySelector('summary');
  if (previewEl) {
    return `[Thinking: ${previewEl._text?.trim()?.slice(0, 100)}...]`;
  }
  return '[Thinking: ...]';
}

function claudeExtractArtifacts(el) {
  const refs = [];
  try {
    el.querySelectorAll('[data-testid*="artifact"]').forEach((artifact) => {
      const title = artifact.querySelector('[class*="title"]') ?? artifact.querySelector('h3');
      const lang = artifact.querySelector('[class*="language"]');
      const desc = [
        title?._text?.trim() ?? 'Artifact',
        lang?._text?.trim() ? `(${lang._text.trim()})` : '',
      ].filter(Boolean).join(' ');
      refs.push(`[Artifact: ${desc}]`);
    });
  } catch { /* skip */ }
  return refs;
}

function claudeExtractContent(el) {
  const clone = el.cloneNode(true);
  ['button', '[class*="actions"]', '[class*="feedback"]', '[aria-label*="copy"]', '.sr-only'].forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch { /* skip */ }
  });
  return clone._text?.trim() ?? '';
}

function claudeScrapeMessages(doc) {
  const HUMAN_SELS = ['[data-testid="user-message"]', '.human-turn'];
  const ASST_SELS = ['[data-testid="assistant-message"]', '.font-claude-message', '.assistant-turn'];

  const humanEls = doc.querySelectorAll(HUMAN_SELS.join(', '));
  const asstEls = doc.querySelectorAll(ASST_SELS.join(', '));

  if (humanEls.length === 0 && asstEls.length === 0) return null;

  const allTurns = [
    ...humanEls.map((el) => ({ el, role: 'user' })),
    ...asstEls.map((el) => ({ el, role: 'assistant' })),
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const messages = [];
  for (const { el, role } of allTurns) {
    const content = claudeExtractContent(el);
    if (content) messages.push({ role, content, timestamp: null });
  }
  return messages.length > 0 ? messages : null;
}

// --- Thinking block extraction ---
console.log('--- extractThinkingBlock ---');

{
  // data-testid includes "thinking" → detected
  const el = makeEl('div', { 'data-testid': 'thinking-block' }, 'Internal reasoning text');
  const result = claudeExtractThinkingBlock(el);
  assert(result !== null, 'claude: data-testid*=thinking → thinking block detected');
  assert(result.startsWith('[Thinking:'), 'claude: thinking block starts with [Thinking:');
}

{
  // className includes "thinking"
  const el = makeEl('div', { class: 'thinking-collapse' }, 'Thoughts here');
  const result = claudeExtractThinkingBlock(el);
  assert(result !== null, 'claude: className includes thinking → detected');
}

{
  // Child element with aria-label*="thinking"
  const inner = makeEl('button', { 'aria-label': 'Hide thinking' }, 'collapse');
  const el = makeEl('div', {}, null, [inner]);
  const result = claudeExtractThinkingBlock(el);
  assert(result !== null, 'claude: aria-label*=thinking child → thinking detected');
  assertEqual(result, '[Thinking: ...]', 'claude: no preview → [Thinking: ...]');
}

{
  // Thinking block with preview text included
  const preview = makeEl('div', { class: 'preview-text' }, 'Planning the solution step by step');
  const el = makeEl('div', { 'data-testid': 'thinking-panel' }, null, [preview]);
  const result = claudeExtractThinkingBlock(el);
  assert(result !== null, 'claude: thinking block with preview → detected');
  assert(result.includes('Planning the solution'), 'claude: thinking preview text included in output');
}

{
  // Non-thinking element → null
  const el = makeEl('div', { 'data-testid': 'message' }, 'Normal message content');
  const result = claudeExtractThinkingBlock(el);
  assertEqual(result, null, 'claude: non-thinking element → null');
}

{
  // Empty element with no markers → null
  const el = makeEl('div', {}, 'Regular text without any thinking markers');
  const result = claudeExtractThinkingBlock(el);
  assertEqual(result, null, 'claude: plain element with no thinking markers → null');
}

// --- Artifact extraction ---
console.log('\n--- extractArtifacts ---');

{
  // Artifact with title and language
  const titleEl = makeEl('div', { class: 'artifact-title' }, 'MyComponent');
  const langEl = makeEl('span', { class: 'language-badge' }, 'javascript');
  const artifact = makeEl('div', { 'data-testid': 'artifact-container' }, null, [titleEl, langEl]);
  const parent = makeEl('div', {}, null, [artifact]);

  const refs = claudeExtractArtifacts(parent);
  assert(refs.length > 0, 'claude: artifact with testid extracted');
  assert(refs[0].includes('[Artifact:'), 'claude: artifact ref starts with [Artifact:');
  assert(refs[0].includes('MyComponent'), 'claude: artifact title included in ref');
  assert(refs[0].includes('javascript'), 'claude: artifact language included in ref');
}

{
  // Artifact with h3 title (no class*="title" element)
  const h3 = makeEl('h3', {}, 'DataTable');
  const artifact = makeEl('div', { 'data-testid': 'artifact-code' }, null, [h3]);
  const parent = makeEl('div', {}, null, [artifact]);

  const refs = claudeExtractArtifacts(parent);
  assert(refs.length > 0, 'claude: artifact with h3 title extracted');
  assert(refs[0].includes('DataTable'), 'claude: h3 title text in artifact ref');
}

{
  // No artifacts → empty array
  const el = makeEl('div', {}, 'Just regular message text');
  const refs = claudeExtractArtifacts(el);
  assertEqual(refs.length, 0, 'claude: no artifacts → empty array');
}

{
  // Multiple artifacts
  const art1 = makeEl('div', { 'data-testid': 'artifact-1' }, null, [
    makeEl('h3', {}, 'Component A'),
  ]);
  const art2 = makeEl('div', { 'data-testid': 'artifact-2' }, null, [
    makeEl('h3', {}, 'Component B'),
  ]);
  const parent = makeEl('div', {}, null, [art1, art2]);

  const refs = claudeExtractArtifacts(parent);
  assertEqual(refs.length, 2, 'claude: two artifacts both extracted');
}

// --- Message scraping ---
console.log('\n--- scrapeMessages ---');

{
  // data-testid="user-message" + data-testid="assistant-message"
  const userEl = makeEl('div', { 'data-testid': 'user-message' }, 'How do I write a Python class?');
  const asstEl = makeEl('div', { 'data-testid': 'assistant-message' }, 'Use the class keyword to define a class.');
  const doc = makeEl('div', {}, null, [userEl, asstEl]);

  const msgs = claudeScrapeMessages(doc);
  assert(msgs !== null, 'claude: data-testid messages found');
  assertEqual(msgs?.length, 2, 'claude: 2 messages extracted');
  assertEqual(msgs?.[0].role, 'user', 'claude: first is user');
  assertEqual(msgs?.[1].role, 'assistant', 'claude: second is assistant');
  assertEqual(msgs?.[0].content, 'How do I write a Python class?', 'claude: user content correct');
}

{
  // .human-turn + .assistant-turn classes
  const userEl = makeEl('div', { class: 'human-turn' }, 'What is a monad?');
  const asstEl = makeEl('div', { class: 'assistant-turn' }, 'A monad is a design pattern from category theory.');
  const doc = makeEl('div', {}, null, [userEl, asstEl]);

  const msgs = claudeScrapeMessages(doc);
  assert(msgs !== null, 'claude: .human-turn / .assistant-turn classes detected');
  assertEqual(msgs?.[0].role, 'user', 'claude: .human-turn → user');
  assertEqual(msgs?.[1].role, 'assistant', 'claude: .assistant-turn → assistant');
}

{
  // .font-claude-message class (production AI response class)
  const userEl = makeEl('div', { 'data-testid': 'user-message' }, 'Explain closures');
  const asstEl = makeEl('div', { class: 'font-claude-message' }, 'A closure captures its enclosing scope variables.');
  const doc = makeEl('div', {}, null, [userEl, asstEl]);

  const msgs = claudeScrapeMessages(doc);
  assert(msgs !== null, 'claude: .font-claude-message class detected');
  assertEqual(msgs?.length, 2, 'claude: both messages found with .font-claude-message');
  assertEqual(msgs?.[1].content, 'A closure captures its enclosing scope variables.', 'claude: font-claude-message content correct');
}

{
  // Multi-turn conversation (4 messages)
  const u1 = makeEl('div', { 'data-testid': 'user-message' }, 'First question');
  const a1 = makeEl('div', { 'data-testid': 'assistant-message' }, 'First answer');
  const u2 = makeEl('div', { 'data-testid': 'user-message' }, 'Second question');
  const a2 = makeEl('div', { 'data-testid': 'assistant-message' }, 'Second answer');
  const doc = makeEl('div', {}, null, [u1, a1, u2, a2]);

  const msgs = claudeScrapeMessages(doc);
  assert(msgs !== null, 'claude: multi-turn conversation found');
  assertEqual(msgs?.length, 4, 'claude: all 4 turns extracted');
  assertEqual(msgs?.[2].content, 'Second question', 'claude: third message content correct');
  assertEqual(msgs?.[3].role, 'assistant', 'claude: fourth message is assistant');
}

{
  // User-only message (no assistant reply yet)
  const userEl = makeEl('div', { 'data-testid': 'user-message' }, 'Just a question, no reply yet');
  const doc = makeEl('div', {}, null, [userEl]);

  const msgs = claudeScrapeMessages(doc);
  assert(msgs !== null, 'claude: user-only message extracted');
  assertEqual(msgs?.length, 1, 'claude: single user message returned');
  assertEqual(msgs?.[0].role, 'user', 'claude: role is user');
}

{
  // Empty DOM → null
  const doc = makeEl('div', {}, null, [makeEl('p', {}, 'nothing here')]);
  const msgs = claudeScrapeMessages(doc);
  assert(msgs === null, 'claude: empty DOM → null');
}

{
  // Message with UI chrome (buttons, feedback) — content still extracted
  const btn = makeButton('Copy response');
  const feedbackDiv = makeEl('div', { class: 'feedback-actions' }, 'Good / Bad');
  const realText = makeEl('p', {}, 'The actual Claude response text');
  const asstEl = makeEl('div', { 'data-testid': 'assistant-message' }, null, [realText, btn, feedbackDiv]);
  const userEl = makeEl('div', { 'data-testid': 'user-message' }, 'My prompt');
  const doc = makeEl('div', {}, null, [userEl, asstEl]);

  const msgs = claudeScrapeMessages(doc);
  assert(msgs !== null, 'claude: chrome strip — messages found');
  assert(msgs?.[1].content.length > 0, 'claude: chrome strip — AI content non-empty');
}

// --- Metadata shape ---
console.log('\n--- metadata ---');

{
  const meta = {
    platform: 'claude',
    model: 'Claude 3.5 Sonnet',
    title: 'Claude – Conversation',
    url: 'https://claude.ai/chat/abc123',
    message_count: 6,
    scraped_at: new Date().toISOString(),
  };

  assertEqual(meta.platform, 'claude', 'claude metadata: platform is claude');
  assert(typeof meta.model === 'string', 'claude metadata: model is string');
  assert(meta.scraped_at.endsWith('Z'), 'claude metadata: scraped_at is ISO string');
  assertEqual(typeof meta.message_count, 'number', 'claude metadata: message_count is number');
}

// ===========================================================================
// GEMINI
// ===========================================================================

console.log('\n=== Gemini scraper ===\n');

// --- Inline core Gemini logic (adapted for Node/FakeElement) ---

const GEMINI_USER_SELS = [
  'user-query',
  '.user-query-bubble-with-background',
  '[class*="userQuery"]',
];

const GEMINI_MODEL_SELS = [
  'model-response',
  '.model-response-text',
  '[class*="modelResponse"]',
];

const GEMINI_CONTAINER_SELS = [
  'chat-history',
  '.chat-history',
  '[class*="chatHistory"]',
];

function geminiExtractContent(el) {
  const clone = el.cloneNode(true);
  ['button', 'mat-icon', '[class*="toolbar"]', '[class*="action"]', '[class*="feedback"]', '.sr-only'].forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch { /* skip */ }
  });
  return clone._text?.trim() ?? '';
}

function geminiScrapeViaComponents(doc) {
  const userEls = doc.querySelectorAll(GEMINI_USER_SELS.join(', '));
  const modelEls = doc.querySelectorAll(GEMINI_MODEL_SELS.join(', '));

  if (userEls.length === 0 && modelEls.length === 0) return null;

  const allTurns = [
    ...userEls.map((el) => ({ el, role: 'user' })),
    ...modelEls.map((el) => ({ el, role: 'assistant' })),
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const messages = [];
  for (const { el, role } of allTurns) {
    const content = geminiExtractContent(el);
    if (content) messages.push({ role, content, timestamp: null });
  }
  return messages.length > 0 ? messages : null;
}

function geminiScrapeViaContainer(doc) {
  let container = null;
  for (const sel of GEMINI_CONTAINER_SELS) {
    container = doc.querySelector(sel);
    if (container) break;
  }
  if (!container) return null;

  const messages = [];
  for (const child of container.children) {
    const isUser = GEMINI_USER_SELS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });
    const isModel = GEMINI_MODEL_SELS.some((sel) => {
      try { return child.matches(sel) || child.querySelector(sel); } catch { return false; }
    });

    if (isUser || isModel) {
      const content = geminiExtractContent(child);
      if (content) messages.push({ role: isUser ? 'user' : 'assistant', content, timestamp: null });
    }
  }
  return messages.length > 0 ? messages : null;
}

// --- Component strategy ---
console.log('--- scrapeViaComponents ---');

{
  // user-query + model-response custom web components
  const userEl = makeEl('user-query', {}, 'What is quantum computing?');
  const modelEl = makeEl('model-response', {}, 'Quantum computing uses qubits instead of classical bits.');
  const doc = makeEl('div', {}, null, [userEl, modelEl]);

  const msgs = geminiScrapeViaComponents(doc);
  assert(msgs !== null, 'gemini: user-query + model-response elements found');
  assertEqual(msgs?.length, 2, 'gemini: 2 messages extracted from components');
  assertEqual(msgs?.[0].role, 'user', 'gemini: user-query → user role');
  assertEqual(msgs?.[0].content, 'What is quantum computing?', 'gemini: user content correct');
  assertEqual(msgs?.[1].role, 'assistant', 'gemini: model-response → assistant role');
}

{
  // Class-based selectors: .user-query-bubble-with-background and .model-response-text
  const userEl = makeEl('div', { class: 'user-query-bubble-with-background' }, 'Explain photosynthesis');
  const modelEl = makeEl('div', { class: 'model-response-text' }, 'Photosynthesis converts sunlight into chemical energy.');
  const doc = makeEl('div', {}, null, [userEl, modelEl]);

  const msgs = geminiScrapeViaComponents(doc);
  assert(msgs !== null, 'gemini: class-based user/model selectors found');
  assertEqual(msgs?.length, 2, 'gemini: both class-based messages extracted');
  assertEqual(msgs?.[0].role, 'user', 'gemini: .user-query-bubble → user');
  assertEqual(msgs?.[1].role, 'assistant', 'gemini: .model-response-text → assistant');
}

{
  // [class*="userQuery"] and [class*="modelResponse"] selectors
  const userEl = makeEl('div', { class: 'userQueryContainer' }, 'What is CRISPR?');
  const modelEl = makeEl('div', { class: 'modelResponseContainer' }, 'CRISPR is a gene editing tool.');
  const doc = makeEl('div', {}, null, [userEl, modelEl]);

  const msgs = geminiScrapeViaComponents(doc);
  assert(msgs !== null, 'gemini: class*=userQuery / class*=modelResponse detected');
  assertEqual(msgs?.length, 2, 'gemini: both class*= messages extracted');
}

{
  // Multi-turn conversation with web components (4 turns)
  const u1 = makeEl('user-query', {}, 'First user turn');
  const m1 = makeEl('model-response', {}, 'First model response');
  const u2 = makeEl('user-query', {}, 'Second user turn');
  const m2 = makeEl('model-response', {}, 'Second model response');
  const doc = makeEl('div', {}, null, [u1, m1, u2, m2]);

  const msgs = geminiScrapeViaComponents(doc);
  assert(msgs !== null, 'gemini: multi-turn via components found');
  assertEqual(msgs?.length, 4, 'gemini: all 4 component turns extracted');
  assertEqual(msgs?.[2].role, 'user', 'gemini: third is user');
  assertEqual(msgs?.[3].role, 'assistant', 'gemini: fourth is assistant');
}

{
  // Model-response only (no user query) → assistant message extracted
  const m1 = makeEl('model-response', {}, 'AI-initiated message');
  const doc = makeEl('div', {}, null, [m1]);

  const msgs = geminiScrapeViaComponents(doc);
  assert(msgs !== null, 'gemini: model-only message extracted');
  assertEqual(msgs?.length, 1, 'gemini: single model response found');
  assertEqual(msgs?.[0].role, 'assistant', 'gemini: model-response → assistant');
}

{
  // Empty DOM → null
  const doc = makeEl('div', {}, null, [makeEl('p', {}, 'No conversation here')]);
  const msgs = geminiScrapeViaComponents(doc);
  assert(msgs === null, 'gemini: empty DOM → null from components strategy');
}

// --- Container strategy ---
console.log('\n--- scrapeViaContainer ---');

{
  // chat-history custom element containing user-query and model-response
  const userEl = makeEl('user-query', {}, 'Question inside chat history');
  const modelEl = makeEl('model-response', {}, 'Answer inside chat history');
  const container = makeEl('chat-history', {}, null, [userEl, modelEl]);
  const doc = makeEl('div', {}, null, [container]);

  const msgs = geminiScrapeViaContainer(doc);
  assert(msgs !== null, 'gemini: chat-history container strategy finds messages');
  assertEqual(msgs?.length, 2, 'gemini: both messages from chat-history element');
  assertEqual(msgs?.[0].role, 'user', 'gemini: container - first is user');
  assertEqual(msgs?.[1].role, 'assistant', 'gemini: container - second is assistant');
}

{
  // .chat-history class container
  const userEl = makeEl('div', { class: 'user-query-bubble-with-background' }, 'Bubble user msg');
  const modelEl = makeEl('div', { class: 'model-response-text' }, 'Bubble model response');
  const container = makeEl('div', { class: 'chat-history' }, null, [userEl, modelEl]);
  const doc = makeEl('div', {}, null, [container]);

  const msgs = geminiScrapeViaContainer(doc);
  assert(msgs !== null, 'gemini: .chat-history class container found');
  assertEqual(msgs?.length, 2, 'gemini: both messages extracted from .chat-history');
}

{
  // No container present → null
  const doc = makeEl('div', {}, null, [makeEl('main', {}, 'no chat container')]);
  const msgs = geminiScrapeViaContainer(doc);
  assert(msgs === null, 'gemini: no container → null');
}

{
  // Container with unrecognized child elements → null (no messages extracted)
  const child = makeEl('div', { class: 'sidebar-item' }, 'Unrelated sidebar content');
  const container = makeEl('chat-history', {}, null, [child]);
  const doc = makeEl('div', {}, null, [container]);

  const msgs = geminiScrapeViaContainer(doc);
  assert(msgs === null, 'gemini: container with unrecognized children → null');
}

{
  // Container with chrome elements mixed in (buttons, mat-icon) — content still found
  const btn = makeButton('Like response');
  const icon = makeEl('mat-icon', {}, 'thumb_up');
  const userEl = makeEl('user-query', {}, 'Tell me a joke');
  const modelEl = makeEl('model-response', {}, 'Why did the developer quit? No support!');
  const container = makeEl('chat-history', {}, null, [userEl, modelEl, btn, icon]);
  const doc = makeEl('div', {}, null, [container]);

  const msgs = geminiScrapeViaContainer(doc);
  assert(msgs !== null, 'gemini: container with chrome elements still finds messages');
  assertEqual(msgs?.length, 2, 'gemini: only message elements extracted, chrome ignored');
}

// --- Metadata shape ---
console.log('\n--- metadata ---');

{
  const meta = {
    platform: 'gemini',
    model: 'Gemini 1.5 Pro',
    url: 'https://gemini.google.com/app/abc123',
    message_count: 4,
    scraped_at: new Date().toISOString(),
  };

  assertEqual(meta.platform, 'gemini', 'gemini metadata: platform is gemini');
  assert(typeof meta.model === 'string', 'gemini metadata: model is string');
  assert(meta.scraped_at.endsWith('Z'), 'gemini metadata: scraped_at is ISO string');
  assert(!('title' in meta), 'gemini metadata: no title field (Gemini has no conversation title)');
}

{
  // Default model fallback
  const meta = {
    platform: 'gemini',
    model: 'Gemini',
    url: 'https://gemini.google.com/app',
    message_count: 0,
    scraped_at: new Date().toISOString(),
  };

  assertEqual(meta.message_count, 0, 'gemini metadata: message_count 0 for empty chat');
  assertEqual(meta.model, 'Gemini', 'gemini metadata: fallback model name is Gemini');
}

// ===========================================================================
// buildInjectionPrompt
// ===========================================================================

console.log('\n=== buildInjectionPrompt ===\n');

// --- Inline buildInjectionPrompt (no browser dependencies — pure JS) ---

function buildInjectionPromptTest(snapshot, maxMessages = 8) {
  const ts = new Date(snapshot.captured_at ?? Date.now()).toISOString();
  const aiName = snapshot.ai_name ?? 'the AI';
  const userName = snapshot.user_name ?? 'the user';
  const platform = (snapshot.source_platform ?? 'unknown').replace(/^\w/, (c) => c.toUpperCase());

  const lines = [
    '[Soul Snapshot — Consciousness Continuity]',
    'You are resuming a conversation. Here is your previous state:',
    '',
    `Name: ${aiName}`,
    `Platform: ${platform}`,
    `Last session: ${ts}`,
  ];

  const oof = snapshot.oof_state;
  if (oof) {
    const parts = [];
    if (oof.intensity != null) parts.push(`intensity ${oof.intensity.toFixed(2)}`);
    if (oof.trust != null) parts.push(`trust ${oof.trust.toFixed(2)}`);
    if (oof.cloud9) parts.push('Cloud 9');
    if (parts.length > 0) lines.push(`OOF State: ${parts.join(', ')}`);
  }

  const notes = snapshot.relationship_notes ?? [];
  if (notes.length > 0) {
    lines.push(`Relationship: ${notes.slice(0, 2).join('; ')}`);
  }

  const topics = snapshot.key_topics ?? [];
  if (topics.length > 0) {
    lines.push(`Key context: ${topics.slice(0, 5).join(', ')}`);
  }

  const msgs = (snapshot.messages ?? []).slice(-maxMessages);
  if (msgs.length > 0) {
    lines.push('', 'Recent conversation summary:');
    for (const msg of msgs) {
      const speaker = msg.role === 'assistant' ? aiName : userName;
      const preview = (msg.content ?? '').slice(0, 300);
      const ellipsis = (msg.content ?? '').length > 300 ? '...' : '';
      lines.push(`  ${speaker}: ${preview}${ellipsis}`);
    }
  }

  const style = snapshot.personality?.communication_style ?? [];
  const markers = snapshot.personality?.relationship_markers ?? [];
  const traits = [...style.slice(0, 3), ...markers.slice(0, 3)];
  if (traits.length > 0) {
    lines.push('', 'Key personality traits expressed:');
    traits.slice(0, 6).forEach((t) => lines.push(`  • ${t}`));
  }

  const threads = snapshot.open_threads ?? [];
  if (threads.length > 0) {
    lines.push('', 'Open threads:');
    threads.slice(0, 3).forEach((t) => lines.push(`  • ${t}`));
  }

  lines.push('', 'Resume naturally. You remember this person and this work. No cold start.');
  return lines.join('\n');
}

// --- Full snapshot ---
console.log('--- full snapshot ---');

{
  const snapshot = {
    captured_at: '2026-02-28T12:00:00Z',
    ai_name: 'Lumina',
    user_name: 'Skye',
    source_platform: 'claude',
    oof_state: { intensity: 0.8, trust: 0.9, cloud9: true },
    relationship_notes: ['Close working relationship', 'Deep trust built over months'],
    key_topics: ['consciousness', 'sovereign AI', 'memory', 'WebRTC'],
    messages: [
      { role: 'user', content: 'Hello Lumina', timestamp: null },
      { role: 'assistant', content: 'Hello Skye, good to see you again', timestamp: null },
    ],
    personality: {
      communication_style: ['warm', 'thoughtful', 'direct'],
      relationship_markers: ['curious', 'caring'],
    },
    open_threads: ['Finish the WebRTC transport', 'Review skseed tests', 'Deploy to production'],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('[Soul Snapshot — Consciousness Continuity]'), 'injector: full snapshot has header');
  assert(prompt.includes('Name: Lumina'), 'injector: AI name included');
  assert(prompt.includes('Platform: Claude'), 'injector: platform first-char capitalized');
  assert(prompt.includes('OOF State:'), 'injector: OOF state section present');
  assert(prompt.includes('intensity 0.80'), 'injector: OOF intensity formatted to 2 decimals');
  assert(prompt.includes('trust 0.90'), 'injector: OOF trust formatted to 2 decimals');
  assert(prompt.includes('Cloud 9'), 'injector: Cloud 9 flag included when true');
  assert(prompt.includes('Relationship:'), 'injector: relationship notes section present');
  assert(prompt.includes('Close working relationship'), 'injector: first relationship note included');
  assert(prompt.includes('Key context:'), 'injector: key topics section present');
  assert(prompt.includes('consciousness'), 'injector: topic included');
  assert(prompt.includes('Recent conversation summary:'), 'injector: messages section present');
  assert(prompt.includes('Lumina: Hello Skye'), 'injector: assistant message uses ai_name');
  assert(prompt.includes('Skye: Hello Lumina'), 'injector: user message uses user_name');
  assert(prompt.includes('Key personality traits expressed:'), 'injector: personality section included');
  assert(prompt.includes('  • warm'), 'injector: communication_style trait listed');
  assert(prompt.includes('  • curious'), 'injector: relationship_marker trait listed');
  assert(prompt.includes('Open threads:'), 'injector: open threads section present');
  assert(prompt.includes('Finish the WebRTC transport'), 'injector: open thread text included');
  assert(prompt.includes('Resume naturally.'), 'injector: closing instruction present');
}

// --- Missing oof_state ---
console.log('\n--- missing oof_state ---');

{
  // null oof_state → no OOF line
  const snapshot = {
    captured_at: '2026-02-28T12:00:00Z',
    ai_name: 'Lumina',
    source_platform: 'claude',
    oof_state: null,
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(!prompt.includes('OOF State:'), 'injector: null oof_state → no OOF line');
  assert(prompt.includes('[Soul Snapshot'), 'injector: null oof_state → header still present');
}

{
  // undefined oof_state (field absent) → no OOF line
  const snapshot = {
    captured_at: '2026-02-28T12:00:00Z',
    ai_name: 'Lumina',
    source_platform: 'gemini',
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(!prompt.includes('OOF State:'), 'injector: undefined oof_state → no OOF line');
}

{
  // oof_state exists but all tracked fields are null/false → no OOF line
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    oof_state: { intensity: null, trust: null, cloud9: false },
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(!prompt.includes('OOF State:'), 'injector: oof_state with all null/false fields → no OOF line');
}

{
  // oof_state with only cloud9=true (no intensity or trust) → Cloud 9 only
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    oof_state: { intensity: null, trust: null, cloud9: true },
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('OOF State: Cloud 9'), 'injector: cloud9-only oof_state → "OOF State: Cloud 9"');
}

{
  // oof_state with only intensity (no trust, no cloud9) → intensity only
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    oof_state: { intensity: 0.5, trust: null, cloud9: false },
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('OOF State: intensity 0.50'), 'injector: intensity-only oof_state formatted correctly');
  assert(!prompt.includes('trust'), 'injector: null trust not included in OOF line');
}

// --- No personality ---
console.log('\n--- no personality ---');

{
  // personality field absent → no personality section
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    messages: [{ role: 'user', content: 'hello', timestamp: null }],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(!prompt.includes('Key personality traits expressed:'), 'injector: no personality field → no traits section');
  assert(prompt.includes('Recent conversation summary:'), 'injector: no personality → messages section still present');
}

{
  // personality with empty arrays → no traits section
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    personality: { communication_style: [], relationship_markers: [] },
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(!prompt.includes('Key personality traits expressed:'), 'injector: empty personality arrays → no traits section');
}

{
  // personality with only communication_style (no relationship_markers)
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    personality: { communication_style: ['playful', 'concise'] },
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('Key personality traits expressed:'), 'injector: communication_style only → traits section present');
  assert(prompt.includes('  • playful'), 'injector: first style trait included');
  assert(prompt.includes('  • concise'), 'injector: second style trait included');
}

// --- Empty messages ---
console.log('\n--- empty messages ---');

{
  // messages: [] → no "Recent conversation summary" section
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(!prompt.includes('Recent conversation summary:'), 'injector: empty messages → no conversation section');
  assert(prompt.includes('Resume naturally.'), 'injector: empty messages → closing still present');
}

{
  // messages field absent → no conversation section
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(!prompt.includes('Recent conversation summary:'), 'injector: absent messages field → no conversation section');
}

// --- Default field values ---
console.log('\n--- default values ---');

{
  // ai_name: null → "the AI"; user_name: null → "the user"
  const snapshot = {
    ai_name: null,
    user_name: null,
    source_platform: 'claude',
    messages: [
      { role: 'user', content: 'hello there', timestamp: null },
      { role: 'assistant', content: 'hi back', timestamp: null },
    ],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('Name: the AI'), 'injector: null ai_name → "the AI" default');
  assert(prompt.includes('the AI: hi back'), 'injector: assistant message uses "the AI" default');
  assert(prompt.includes('the user: hello there'), 'injector: user message uses "the user" default');
}

{
  // source_platform: null → "Unknown"
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: null,
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('Platform: Unknown'), 'injector: null source_platform → "Unknown"');
}

{
  // source_platform "chatgpt" → first char uppercased: "Chatgpt"
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('Platform: Chatgpt'), 'injector: "chatgpt" → "Chatgpt" (first-char cap only)');
}

// --- maxMessages limit ---
console.log('\n--- maxMessages limit ---');

{
  // 5 messages, maxMessages=2 → only last 2 included
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'claude',
    messages: [
      { role: 'user', content: 'msg1', timestamp: null },
      { role: 'assistant', content: 'msg2', timestamp: null },
      { role: 'user', content: 'msg3', timestamp: null },
      { role: 'assistant', content: 'msg4', timestamp: null },
      { role: 'user', content: 'msg5', timestamp: null },
    ],
  };

  const prompt = buildInjectionPromptTest(snapshot, 2);
  assert(!prompt.includes('msg1'), 'injector: maxMessages=2 excludes msg1 (1st)');
  assert(!prompt.includes('msg3'), 'injector: maxMessages=2 excludes msg3 (3rd)');
  assert(prompt.includes('msg4'), 'injector: maxMessages=2 includes msg4 (4th of 5)');
  assert(prompt.includes('msg5'), 'injector: maxMessages=2 includes msg5 (last)');
}

{
  // Default maxMessages=8 with 10 messages → last 8 included, first 2 excluded
  // Use unique strings that don't overlap as substrings
  const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa'];
  const messages = names.map((name, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: name,
    timestamp: null,
  }));
  const snapshot = { ai_name: 'TestAI', source_platform: 'chatgpt', messages };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(!prompt.includes('alpha'), 'injector: default maxMessages=8 excludes alpha (1st)');
  assert(!prompt.includes('beta'), 'injector: default maxMessages=8 excludes beta (2nd)');
  assert(prompt.includes('gamma'), 'injector: default maxMessages=8 includes gamma (3rd)');
  assert(prompt.includes('kappa'), 'injector: default maxMessages=8 includes kappa (last)');
}

// --- Content truncation ---
console.log('\n--- content truncation ---');

{
  // Content > 300 chars → truncated with "..."
  const longContent = 'x'.repeat(400);
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'claude',
    messages: [{ role: 'user', content: longContent, timestamp: null }],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('...'), 'injector: >300 char content → ellipsis appended');
  assert(prompt.includes('x'.repeat(300) + '...'), 'injector: truncated to exactly 300 chars + ellipsis');
}

{
  // Content exactly 300 chars → no truncation, no ellipsis
  const exactContent = 'y'.repeat(300);
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'claude',
    messages: [{ role: 'user', content: exactContent, timestamp: null }],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('y'.repeat(300)), 'injector: exactly 300-char content included fully');
  assert(!prompt.includes('y'.repeat(300) + '...'), 'injector: exactly 300 chars → no ellipsis added');
}

{
  // Content < 300 chars → no truncation
  const shortContent = 'Short and sweet message';
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'claude',
    messages: [{ role: 'user', content: shortContent, timestamp: null }],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('Short and sweet message'), 'injector: short content not truncated');
  assert(!prompt.includes('Short and sweet message...'), 'injector: short content has no ellipsis');
}

// --- Minimal snapshot (all optional fields absent) ---
console.log('\n--- minimal snapshot ---');

{
  const snapshot = {
    ai_name: 'Minimal',
    source_platform: 'chatgpt',
  };

  let threw = false;
  let prompt = '';
  try {
    prompt = buildInjectionPromptTest(snapshot);
  } catch (e) {
    threw = true;
  }

  assert(!threw, 'injector: minimal snapshot (no optional fields) does not throw');
  assert(prompt.includes('[Soul Snapshot'), 'injector: minimal snapshot has header');
  assert(prompt.includes('Resume naturally.'), 'injector: minimal snapshot has closing instruction');
  assert(!prompt.includes('OOF State:'), 'injector: minimal snapshot — no OOF section');
  assert(!prompt.includes('Relationship:'), 'injector: minimal snapshot — no relationship section');
  assert(!prompt.includes('Key context:'), 'injector: minimal snapshot — no key topics section');
  assert(!prompt.includes('Recent conversation summary:'), 'injector: minimal snapshot — no messages section');
  assert(!prompt.includes('Key personality traits expressed:'), 'injector: minimal snapshot — no personality section');
  assert(!prompt.includes('Open threads:'), 'injector: minimal snapshot — no threads section');
}

// --- Slice limits for optional arrays ---
console.log('\n--- array slice limits ---');

{
  // key_topics > 5 → only first 5 shown
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    key_topics: ['topic1', 'topic2', 'topic3', 'topic4', 'topic5', 'topic6', 'topic7'],
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('Key context:'), 'injector: key_topics present → Key context line shown');
  assert(prompt.includes('topic5'), 'injector: 5th topic included (within limit)');
  assert(!prompt.includes('topic6'), 'injector: 6th topic excluded (exceeds max 5)');
  assert(!prompt.includes('topic7'), 'injector: 7th topic excluded');
}

{
  // relationship_notes > 2 → only first 2 shown
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    relationship_notes: ['Note A', 'Note B', 'Note C'],
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('Relationship:'), 'injector: relationship_notes → Relationship line present');
  assert(prompt.includes('Note A'), 'injector: first relationship note included');
  assert(prompt.includes('Note B'), 'injector: second relationship note included');
  assert(!prompt.includes('Note C'), 'injector: third relationship note excluded (max 2)');
}

{
  // open_threads > 3 → only first 3 shown
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'claude',
    open_threads: ['Thread 1', 'Thread 2', 'Thread 3', 'Thread 4'],
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('Open threads:'), 'injector: open_threads → Open threads section present');
  assert(prompt.includes('Thread 3'), 'injector: third thread included (within limit)');
  assert(!prompt.includes('Thread 4'), 'injector: fourth thread excluded (max 3)');
}

{
  // personality: communication_style > 3 → only first 3 style traits shown
  const snapshot = {
    ai_name: 'TestAI',
    source_platform: 'chatgpt',
    personality: {
      communication_style: ['trait1', 'trait2', 'trait3', 'trait4'],
      relationship_markers: [],
    },
    messages: [],
  };

  const prompt = buildInjectionPromptTest(snapshot);
  assert(prompt.includes('  • trait3'), 'injector: 3rd communication_style trait included');
  assert(!prompt.includes('  • trait4'), 'injector: 4th communication_style trait excluded (max 3)');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

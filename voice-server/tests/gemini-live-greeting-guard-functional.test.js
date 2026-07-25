// SCRUM-576 — FUNCTIONAL tests for greeting recovery, driving a real session
// through the fake Gemini socket.
//
// Why these exist alongside the source pins: the pin on handleGreetingRecovery
// asserts only that sendGreetingTrigger("retrigger") appears somewhere below
// the function header. It does NOT bind the re-send to the guard's verdict, so
// inverting the gate to `if (!shouldRetrigger)` left the entire suite green —
// while re-sending the greeting exactly when the guard says not to (talking
// over a caller mid-barge-in) and never when it should (the original bug), on
// both call sites at once. Only counting the messages that actually reach
// Gemini can catch that.
//
// The guard is left at its production default here (env deliberately NOT set)
// — this is also the only coverage of the default-ON path through the wiring.

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

delete process.env.GREETING_GUARD; // production default: ON

const created = [];

class FakeWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.sent = [];
    this.readyState = FakeWebSocket.OPEN;
    created.push(this);
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

const wsPath = require.resolve("ws");
require.cache[wsPath] = { id: wsPath, filename: wsPath, loaded: true, exports: FakeWebSocket };

process.env.GEMINI_API_KEY = "test-key";

const { createGeminiSession } = require("../services/gemini-live");
const { GREETING_MIN_HEARD_MS } = require("../lib/greeting-guard");

/** Text nudges sent to Gemini — one per greeting trigger. */
const greetingTriggers = (ws) => ws.sent.filter((m) => m.realtimeInput && typeof m.realtimeInput.text === "string");
/** Caller audio that actually reached Gemini. */
const audioFrames = (ws) => ws.sent.filter((m) => m.realtimeInput && m.realtimeInput.audio);

function startSession() {
  const session = createGeminiSession(
    { systemPrompt: "prompt", tools: [], voiceName: "Kore" },
    { onAudio: () => {}, onToolCall: async () => ({}), onError: () => {}, onClose: () => {} }
  );
  const ws = created[created.length - 1];
  ws.emit("open");
  ws.emit("message", JSON.stringify({ setupComplete: {} }));
  return { session, ws };
}

/** A model audio chunk — 24k PCM in, converted to mulaw for Twilio. */
const modelAudio = () =>
  JSON.stringify({
    serverContent: { modelTurn: { parts: [{ inlineData: { data: Buffer.alloc(960).toString("base64") } }] } },
  });

before(() => {
  assert.equal(greetingTriggers(startSession().ws).length, 1, "sanity: setup sends exactly one greeting trigger");
});

test("a cancel BEFORE any audio re-sends the greeting", () => {
  const { ws } = startSession();
  ws.emit("message", JSON.stringify({ serverContent: { interrupted: true } }));
  assert.equal(
    greetingTriggers(ws).length,
    2,
    "the caller heard nothing — the greeting must be re-sent (this is the logged incident)"
  );
});

test("a real barge-in AFTER the caller heard the greeting does NOT re-send it", async () => {
  // Real sleep, not mock.timers: the guard runs on performance.now(), which
  // fake timers cannot move.
  const { ws } = startSession();
  ws.emit("message", modelAudio());
  await new Promise((r) => setTimeout(r, GREETING_MIN_HEARD_MS + 100));
  ws.emit("message", JSON.stringify({ serverContent: { interrupted: true } }));
  assert.equal(
    greetingTriggers(ws).length,
    1,
    "replaying the greeting over a caller who is already speaking is worse than the bug being fixed"
  );
});

test("a turn that ends WITHOUT audio re-sends the greeting", () => {
  const { ws } = startSession();
  ws.emit("message", JSON.stringify({ serverContent: { turnComplete: true } }));
  assert.equal(greetingTriggers(ws).length, 2, "a turn that produced nothing is not a delivered greeting");
});

test("a delivered greeting releases the caller's audio", () => {
  const { session, ws } = startSession();
  const frame = Buffer.alloc(160, 0x7f).toString("base64");

  session.sendAudio(frame);
  assert.equal(audioFrames(ws).length, 0, "held while the greeting is being delivered");

  ws.emit("message", modelAudio());
  ws.emit("message", JSON.stringify({ serverContent: { turnComplete: true } }));

  for (let i = 0; i < 4; i++) session.sendAudio(frame);
  assert.ok(audioFrames(ws).length > 0, "once the greeting lands the caller must be heard");
});

test("outbound personas (triggerGreeting: false) are never held", () => {
  // Their counterpart is a HUMAN who speaks first — muting them would be a
  // brand-new bug introduced by a fix for the opposite problem.
  const session = createGeminiSession(
    { systemPrompt: "prompt", tools: [], voiceName: "Kore", triggerGreeting: false },
    { onAudio: () => {}, onToolCall: async () => ({}), onError: () => {}, onClose: () => {} }
  );
  const ws = created[created.length - 1];
  ws.emit("open");
  ws.emit("message", JSON.stringify({ setupComplete: {} }));
  assert.equal(greetingTriggers(ws).length, 0, "no greeting was requested");

  for (let i = 0; i < 4; i++) session.sendAudio(Buffer.alloc(160, 0x7f).toString("base64"));
  assert.ok(audioFrames(ws).length > 0, "the human on the other end must be heard immediately");
});

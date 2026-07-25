const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * SCRUM-576 — source pins for the greeting-guard wiring.
 *
 * createGeminiSession opens a live WebSocket on construction, so the wiring
 * can't be exercised in a unit test without a Gemini stand-in; the guard's
 * behaviour is unit-tested in greeting-guard.test.js and these pins verify it
 * is actually CONNECTED. Every hook below is load-bearing: drop any one and the
 * guard degrades silently into either "greeting still killable" (the original
 * bug) or "caller muted" (a worse one), with no test, type error or build
 * failure to notice.
 */

const src = fs.readFileSync(path.join(__dirname, "..", "services", "gemini-live.js"), "utf8");

describe("SCRUM-576: greeting-guard wiring in gemini-live", () => {
  it("the session creates a guard", () => {
    assert.match(src, /require\("\.\.\/lib\/greeting-guard"\)/);
    assert.match(src, /const greetingGuard = createGreetingGuard\(\)/);
  });

  it("the greeting is triggered only on the FIRST setupComplete", () => {
    // Gemini can send a duplicate setupComplete — the handler already treats
    // onSetupComplete as edge-triggered for exactly that reason. The greeting
    // must be edge-triggered too: a duplicate ack re-sending "Call connected."
    // makes the AI re-introduce itself in the middle of a live conversation.
    // Pinned as the literal condition rather than "a firstAck appears
    // somewhere above": the onSetupComplete callback already sits in its own
    // `if (firstAck)` block, so a proximity match would pass without the
    // greeting being gated at all.
    assert.match(src, /if \(firstAck && config\.triggerGreeting !== false\)/);
  });

  it("the guard is armed only when the trigger was actually sent", () => {
    // Arming on a FAILED send would hold the caller's audio waiting for a
    // greeting that was never requested — silence with no recovery path.
    assert.match(
      src,
      /if \(sendGreetingTrigger\(\)\) \{[^]{0,120}?greetingGuard\.onGreetingTriggered\(nowMs\(\)\)/
    );
  });

  it("sendGreetingTrigger reports failure instead of assuming success", () => {
    // The retry path depends on this boolean; a function that always returned
    // true would arm the guard against a dead socket.
    assert.match(src, /function sendGreetingTrigger\(reason = "initial"\)/);
    assert.match(src, /if \(ws\.readyState !== WebSocket\.OPEN\) return false/);
    assert.match(src, /console\.error\("\[GeminiLive\] Greeting trigger failed:[^]{0,80}?return false/);
  });

  it("inbound audio is held while the greeting is delivered — AFTER the pre-setup buffer branch", () => {
    // Order matters: the hold must not swallow the pre-setup buffering branch,
    // which exists to keep the caller's first words across session setup.
    const bufferIdx = src.indexOf("preSetupBuffer.push(twilioBase64)");
    const holdIdx = src.indexOf("greetingGuard.shouldHoldInbound(nowMs())");
    const sendIdx = src.indexOf('mimeType: "audio/pcm;rate=16000"');
    assert.ok(bufferIdx > 0 && holdIdx > 0 && sendIdx > 0, "all three sites must exist");
    assert.ok(bufferIdx < holdIdx, "the hold must come after the pre-setup buffer branch");
    assert.ok(holdIdx < sendIdx, "the hold must short-circuit BEFORE audio reaches Gemini");
  });

  it("the hold is a bare early return — no processing of held frames", () => {
    assert.match(src, /if \(greetingGuard\.shouldHoldInbound\(nowMs\(\)\)\) return;/);
  });

  it("output audio stamps the guard so 'did the caller hear it' is measurable", () => {
    assert.match(
      src,
      /geminiToTwilio\(part\.inlineData\.data\)[^]{0,400}?greetingGuard\.onOutputAudio\(nowMs\(\)\)/
    );
  });

  it("the interrupt callback still fires unconditionally, before the guard is consulted", () => {
    // Gemini has ALREADY discarded its turn by the time `interrupted` arrives.
    // Gating the flush on the guard would leave stale audio queued to the
    // caller — the guard adds recovery, it must not remove existing behaviour.
    const cbIdx = src.indexOf("callbacks.onInterrupted?.()");
    const guardIdx = src.indexOf("greetingGuard.onInterrupt(nowMs())");
    assert.ok(cbIdx > 0 && guardIdx > 0, "both must exist");
    assert.ok(cbIdx < guardIdx, "the flush must not be gated behind the guard");
  });

  it("BOTH failure signals route through the same recovery handler", () => {
    // A cancelled turn and a turn that ended with no audio are the same
    // failure wearing different hats. Handling one and forgetting the other is
    // exactly how the first version of this fix still let a greeting silently
    // fail to reach the caller.
    assert.match(src, /handleGreetingRecovery\(greetingGuard\.onInterrupt\(nowMs\(\)\)/);
    assert.match(src, /handleGreetingRecovery\(greetingGuard\.onTurnComplete\(nowMs\(\)\)/);
    const handlers = src.match(/handleGreetingRecovery\(/g) || [];
    assert.equal(handlers.length, 3, "definition + exactly two call sites");
  });

  it("the recovery handler re-sends the trigger and escalates a failed re-send", () => {
    assert.match(
      src,
      /function handleGreetingRecovery\([^]{0,900}?sendGreetingTrigger\("retrigger"\)/
    );
    assert.match(
      src,
      /Greeting re-trigger could not be sent[^]{0,300}?Sentry\.captureMessage\([^]{0,200}?"error"\s*\)/
    );
  });

  it("exhausted recovery escalates to Sentry at error level, not just a console line", () => {
    // The original bug survived because it only produced info-level logs. If
    // the guard gives up, the caller is back in that exact state — a whole
    // call lost live — so this is one notch above the CUSTOM_VAD fallback's
    // "warning". `\s*` before the paren: captureMessage is wrapped across
    // lines, so `"error")` never appears adjacent in the source.
    assert.match(
      src,
      /takeGiveUpNotice\(\)\) \{[^]{0,900}?Sentry\.captureMessage\([^]{0,300}?"error"\s*\)/
    );
  });

  it("a greeting trigger that never sent at setupComplete is escalated", () => {
    // The site that decides whether the call gets a greeting AT ALL. Silence
    // here = a caller who will never be greeted, on a normal-looking session.
    assert.match(
      src,
      /Greeting trigger not sent \(readyState=\$\{ws\.readyState\}\)[^]{0,300}?Sentry\.captureMessage\([^]{0,200}?"error"\s*\)/
    );
  });

  it("turnComplete is consulted BEFORE the turn callback runs", () => {
    const disarmIdx = src.indexOf("greetingGuard.onTurnComplete(nowMs())");
    const cbIdx = src.indexOf("callbacks.onTurnComplete?.()");
    assert.ok(disarmIdx > 0, "turnComplete must reach the guard");
    assert.ok(disarmIdx < cbIdx, "resolve the greeting before handing control to the call site");
  });

  it("the guard uses a MONOTONIC clock, never Date.now()", () => {
    // A backward wall-clock step while armed makes both elapsed comparisons
    // negative, so both bounds pass and the caller is muted for the length of
    // the step — the unbounded mute this guard exists to prevent.
    assert.match(src, /const nowMs = \(\) => performance\.now\(\)/);
    const guardCalls = src.match(/greetingGuard\.\w+\(Date\.now\(\)\)/g) || [];
    assert.deepEqual(guardCalls, [], "no guard call may take the wall clock");
  });

  it("the greeting outcome is recorded at session close", () => {
    // The original incident "looked successful in every metric collected"
    // because no metric answered whether the greeting reached the caller.
    assert.match(src, /Greeting outcome: delivered=\$\{g\.delivered\}/);
  });
});

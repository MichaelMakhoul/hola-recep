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

  it("the guard is armed only when the trigger was actually sent", () => {
    // Arming on a FAILED send would hold the caller's audio waiting for a
    // greeting that was never requested — silence with no recovery path.
    assert.match(
      src,
      /if \(sendGreetingTrigger\(\)\) \{[^]{0,120}?greetingGuard\.onGreetingTriggered\(Date\.now\(\)\)/
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
    const holdIdx = src.indexOf("greetingGuard.shouldHoldInbound(Date.now())");
    const sendIdx = src.indexOf('mimeType: "audio/pcm;rate=16000"');
    assert.ok(bufferIdx > 0 && holdIdx > 0 && sendIdx > 0, "all three sites must exist");
    assert.ok(bufferIdx < holdIdx, "the hold must come after the pre-setup buffer branch");
    assert.ok(holdIdx < sendIdx, "the hold must short-circuit BEFORE audio reaches Gemini");
  });

  it("the hold is a bare early return — no processing of held frames", () => {
    assert.match(src, /if \(greetingGuard\.shouldHoldInbound\(Date\.now\(\)\)\) return;/);
  });

  it("output audio stamps the guard so 'did the caller hear it' is measurable", () => {
    assert.match(
      src,
      /geminiToTwilio\(part\.inlineData\.data\)[^]{0,400}?greetingGuard\.onOutputAudio\(Date\.now\(\)\)/
    );
  });

  it("the interrupt callback still fires unconditionally, before the guard is consulted", () => {
    // Gemini has ALREADY discarded its turn by the time `interrupted` arrives.
    // Gating the flush on the guard would leave stale audio queued to the
    // caller — the guard adds recovery, it must not remove existing behaviour.
    const cbIdx = src.indexOf("callbacks.onInterrupted?.()");
    const guardIdx = src.indexOf("greetingGuard.onInterrupt(Date.now())");
    assert.ok(cbIdx > 0 && guardIdx > 0, "both must exist");
    assert.ok(cbIdx < guardIdx, "the flush must not be gated behind the guard");
  });

  it("a cancelled greeting re-sends the trigger", () => {
    assert.match(
      src,
      /if \(greetingGuard\.onInterrupt\(Date\.now\(\)\)\) \{[^]{0,300}?sendGreetingTrigger\("retrigger"\)/
    );
  });

  it("turnComplete disarms the guard BEFORE the turn callback runs", () => {
    // Without this the guard never releases on the normal path and would hold
    // the caller's audio until its timeout on every single call.
    const disarmIdx = src.indexOf("greetingGuard.onTurnComplete(Date.now())");
    const cbIdx = src.indexOf("callbacks.onTurnComplete?.()");
    assert.ok(disarmIdx > 0, "turnComplete must disarm the guard");
    assert.ok(disarmIdx < cbIdx, "disarm before handing control to the call site");
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createGreetingGuard,
  GREETING_MAX_HOLD_MS,
  GREETING_ABSOLUTE_HOLD_CAP_MS,
  GREETING_MIN_HEARD_MS,
  GREETING_MAX_RETRIGGERS,
} = require("../lib/greeting-guard");

/**
 * SCRUM-576: a demo visitor sat through 17 seconds of "Call Active" and never
 * heard the AI. Fly logs for that session:
 *
 *   10:31:58.866  Sent realtimeInput.text trigger for greeting
 *   10:31:59.220  User interrupted (barge-in)     <-- 354ms later
 *   10:32:19.511  Session closed                  <-- 20s of silence
 *
 * Gemini's VAD heard room noise, cancelled its own greeting turn BEFORE
 * emitting any audio, then waited for the caller. The caller waited for the AI.
 * Deadlock, no error, nothing alerted. The same greeting path runs for real
 * phone calls, so a noisy line at pickup can strand a paying customer's caller.
 *
 * Two mechanisms, in this order:
 *  1. PREVENT — hold inbound audio for the duration of the greeting turn, so
 *     noise never reaches Gemini's VAD and cannot cancel the greeting.
 *     (`sc.interrupted` is Gemini telling us it ALREADY killed its turn —
 *     swallowing that signal locally would not un-cancel it, so suppression
 *     alone could never have fixed this.)
 *  2. RECOVER — if a cancel still lands before the caller heard anything,
 *     re-send the greeting trigger instead of going silent forever.
 */

const T0 = 1_800_000_000_000;

describe("SCRUM-576: greeting guard — inert until the greeting is triggered", () => {
  it("does not hold inbound audio before the greeting is armed", () => {
    const g = createGreetingGuard({ enabled: true });
    assert.equal(g.shouldHoldInbound(T0), false);
  });

  it("never re-triggers for an interrupt that arrives before arming", () => {
    const g = createGreetingGuard({ enabled: true });
    assert.equal(g.onInterrupt(T0), false);
  });

  it("stays inert for outbound personas (triggerGreeting=false never arms it)", () => {
    // Outbound caller personas wait for the OTHER side to greet. Holding their
    // inbound audio would mute the human they called.
    const g = createGreetingGuard({ enabled: true });
    g.onOutputAudio(T0);
    g.onTurnComplete(T0);
    assert.equal(g.shouldHoldInbound(T0 + 100), false);
    assert.equal(g.onInterrupt(T0 + 200), false);
  });
});

describe("SCRUM-576: greeting guard — holding inbound audio (the noise filter)", () => {
  it("holds inbound audio while the greeting is being delivered", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    assert.equal(g.shouldHoldInbound(T0 + 1), true);
    g.onOutputAudio(T0 + 500);
    assert.equal(g.shouldHoldInbound(T0 + 900), true, "must keep holding WHILE the greeting speaks");
  });

  it("releases the hold as soon as the greeting turn completes", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 400);
    g.onTurnComplete(T0 + 3000);
    assert.equal(g.shouldHoldInbound(T0 + 3001), false, "caller must be heard the instant the greeting ends");
  });

  it("releases the hold after the max window even if the turn never completes", () => {
    // Without this a lost turnComplete (or a Gemini turn that never closes)
    // would mute the caller for the whole call — a worse bug than the one
    // being fixed.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    assert.equal(g.shouldHoldInbound(T0 + GREETING_MAX_HOLD_MS - 1), true);
    assert.equal(g.shouldHoldInbound(T0 + GREETING_MAX_HOLD_MS + 1), false);
  });

  it("re-triggering cannot extend the hold past the absolute cap", () => {
    // Each re-trigger re-arms the per-attempt window; without an absolute cap
    // measured from the FIRST arming, repeated cancels would keep the caller
    // muted for maxHold × (retries + 1).
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    // The re-triggers must be spaced LATE, so the final per-attempt window is
    // still wide open when the absolute cap expires. Bunching them at the start
    // lets the per-attempt window expire first and the assertion passes with
    // the cap deleted — a green test pinning nothing.
    let now = T0;
    const spacing = Math.floor(GREETING_ABSOLUTE_HOLD_CAP_MS / (GREETING_MAX_RETRIGGERS + 1));
    for (let i = 0; i < GREETING_MAX_RETRIGGERS; i++) {
      now += spacing;
      assert.equal(g.onInterrupt(now), true, `retrigger ${i + 1} should fire`);
    }
    const justInside = GREETING_ABSOLUTE_HOLD_CAP_MS - 1;
    assert.ok(
      justInside - (now - T0) < GREETING_MAX_HOLD_MS,
      "setup check: the per-attempt window must still be open at the cap, or this test pins nothing"
    );
    assert.equal(g.shouldHoldInbound(T0 + justInside), true, "still holding just inside the cap");
    assert.equal(
      g.shouldHoldInbound(T0 + GREETING_ABSOLUTE_HOLD_CAP_MS + 1),
      false,
      "the absolute cap must win over a freshly re-armed per-attempt window"
    );
    assert.ok(
      GREETING_ABSOLUTE_HOLD_CAP_MS < GREETING_MAX_HOLD_MS * (GREETING_MAX_RETRIGGERS + 1),
      "the cap must actually bind — otherwise it is decorative"
    );
  });
});

describe("SCRUM-576: greeting guard — recovery when the greeting is cancelled", () => {
  it("re-triggers when the greeting is cancelled before ANY audio (the logged bug)", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    assert.equal(g.onInterrupt(T0 + 354), true, "354ms, no audio emitted — exactly the logged failure");
  });

  it("re-triggers when the caller heard only a fragment", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 600);
    // 200ms of audio: a clipped syllable, not a greeting.
    assert.equal(g.onInterrupt(T0 + 800), true);
  });

  it("does NOT re-trigger once the caller has heard the greeting (real barge-in)", () => {
    // A caller talking over an audible greeting is normal behaviour. Replaying
    // the greeting on top of them would be worse than the silence bug.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 500);
    assert.equal(g.onInterrupt(T0 + 500 + GREETING_MIN_HEARD_MS + 1), false);
  });

  it("stops holding inbound audio after a genuine barge-in", () => {
    // The caller is now speaking — every frame matters.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 500);
    g.onInterrupt(T0 + 500 + GREETING_MIN_HEARD_MS + 1);
    assert.equal(g.shouldHoldInbound(T0 + 500 + GREETING_MIN_HEARD_MS + 2), false);
  });

  it("caps re-triggers so a hostile line cannot loop the greeting forever", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    let now = T0;
    for (let i = 0; i < GREETING_MAX_RETRIGGERS; i++) {
      now += 100;
      assert.equal(g.onInterrupt(now), true, `retrigger ${i + 1} allowed`);
    }
    assert.equal(g.onInterrupt(now + 100), false, "past the cap it must give up, not loop");
    assert.equal(g.shouldHoldInbound(now + 101), false, "giving up must also free the caller's audio");
  });

  it("never re-triggers a mid-call barge-in after the greeting was delivered", () => {
    // The single most dangerous regression: replaying the greeting in the
    // middle of a booking conversation.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 400);
    g.onTurnComplete(T0 + 3000);
    assert.equal(g.onInterrupt(T0 + 30_000), false);
    assert.equal(g.onInterrupt(T0 + 90_000), false);
  });

  it("a second turn's audio cannot re-arm the guard", () => {
    // onOutputAudio/onTurnComplete fire for EVERY turn, not just the greeting.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 400);
    g.onTurnComplete(T0 + 3000);
    g.onOutputAudio(T0 + 20_000); // AI answering a question later in the call
    assert.equal(g.shouldHoldInbound(T0 + 20_001), false);
    assert.equal(g.onInterrupt(T0 + 20_100), false);
  });
});

describe("SCRUM-576: greeting guard — kill switch", () => {
  it("disabled: never holds and never re-triggers", () => {
    const g = createGreetingGuard({ enabled: false });
    g.onGreetingTriggered(T0);
    assert.equal(g.shouldHoldInbound(T0 + 1), false);
    assert.equal(g.onInterrupt(T0 + 354), false);
  });

  it("exposes counters for the session summary", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onInterrupt(T0 + 200);
    assert.equal(g.stats().retriggers, 1);
  });
});

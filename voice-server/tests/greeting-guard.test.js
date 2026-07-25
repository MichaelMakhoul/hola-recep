const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createGreetingGuard,
  greetingGuardEnabled,
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

  it("a DUPLICATE greeting trigger after delivery cannot re-arm the guard", () => {
    // gemini-live's setupComplete handler already carries a `firstAck` guard
    // because Gemini can send a duplicate setupComplete ("a duplicate ack must
    // not re-fire consumers", SCRUM-535). If a duplicate re-armed this guard
    // mid-call, the next ordinary barge-in would look like "greeting cancelled
    // before the caller heard it" and re-send the greeting trigger — the AI
    // would re-introduce itself in the middle of a booking.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 400);
    g.onTurnComplete(T0 + 3000);

    g.onGreetingTriggered(T0 + 60_000); // duplicate setupComplete, mid-call
    assert.equal(g.shouldHoldInbound(T0 + 60_100), false, "must not start muting the caller mid-call");
    assert.equal(g.onInterrupt(T0 + 61_000), false, "must not replay the greeting mid-booking");
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

describe("SCRUM-576: greeting guard — a turn that ends without audio is NOT a delivered greeting", () => {
  it("turnComplete with no audio does not count as delivered, and asks for recovery", () => {
    // The guard's only failure detector was `interrupted`. A greeting turn that
    // simply ENDS without audio (safety-filtered, empty, or every chunk failing
    // geminiToTwilio conversion — that catch means onOutputAudio never fires)
    // was recorded as success and the guard went permanently inert. That is
    // SCRUM-576 reproduced straight through the fix.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    assert.equal(g.onTurnComplete(T0 + 900), true, "must ask for a re-trigger, not declare success");
    assert.equal(g.stats().delivered, false, "must not claim the caller heard a greeting");
  });

  it("a turnComplete arriving WITH an interrupt cannot disarm the fresh retry", () => {
    // gemini-live reads sc.interrupted and sc.turnComplete off the SAME
    // serverContent object, in that order. One message carrying both would
    // re-trigger and then immediately disarm, so attempt 2 would run with no
    // recovery left and inbound audio flowing.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    assert.equal(g.onInterrupt(T0 + 300), true, "the cancel re-triggers");
    g.onTurnComplete(T0 + 300); // same message, stale turn
    assert.equal(g.stats().delivered, false, "the cancelled turn must not read as delivered");
    assert.equal(g.shouldHoldInbound(T0 + 400), true, "the retry must still be protected");
  });

  it("a turn WITH audio still delivers normally", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 400);
    assert.equal(g.onTurnComplete(T0 + 3000), false, "no recovery needed");
    assert.equal(g.stats().delivered, true);
    assert.equal(g.shouldHoldInbound(T0 + 3001), false);
  });

  it("repeated silent turns give up and raise the alert, rather than looping", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    let now = T0;
    for (let i = 0; i < GREETING_MAX_RETRIGGERS; i++) {
      now += 500;
      assert.equal(g.onTurnComplete(now), true, `silent turn ${i + 1} retries`);
    }
    now += 500;
    assert.equal(g.onTurnComplete(now), false, "past the cap it stops retrying");
    assert.equal(g.takeGiveUpNotice(), true, "and says so");
  });
});

describe("SCRUM-576: greeting guard — the greeting window is TERMINAL", () => {
  // The caps used to only silence shouldHoldInbound; `armed` stayed true for
  // the rest of the call whenever an attempt drew no turnComplete at all —
  // which is exactly what the logged incident shows Gemini doing. An armed
  // guard then treats a LATER turn as the greeting.
  const stuck = () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onInterrupt(T0 + 354); // retrigger; Gemini then goes silent forever
    return g;
  };

  it("resolves itself once the caps expire, with no turnComplete ever arriving", () => {
    const g = stuck();
    g.shouldHoldInbound(T0 + GREETING_ABSOLUTE_HOLD_CAP_MS + 1);
    assert.equal(g.stats().armed, false, "past the caps it must be RESOLVED, not merely quiet");
  });

  it("a mid-call turn that ends without audio never replays the greeting", () => {
    // The path the onInterrupt cap check does not cover: turnComplete routes
    // straight into recovery, so a later tool-only/empty turn re-sent
    // "Call connected." into a live booking.
    assert.equal(stuck().onTurnComplete(T0 + 31_000), false, "31s in");
    assert.equal(stuck().onTurnComplete(T0 + 300_000), false, "5 minutes in");
  });

  it("a later turn's audio is never mistaken for the greeting", () => {
    const g = stuck();
    g.onOutputAudio(T0 + 31_000); // the AI answering a question 30s into the call
    assert.equal(g.onInterrupt(T0 + 31_300), false, "a fast barge-in must not re-send the greeting");
  });
});

describe("SCRUM-576: greeting guard — heard-time is measured from the FIRST chunk", () => {
  it("streaming audio does not keep resetting the heard clock", () => {
    // If each chunk restamped the start, heard-time stays ~0 for the whole
    // greeting and a barge-in 2s in reads as "heard nothing" → the greeting
    // replays over the caller. Every other test emits exactly one chunk, so
    // this is the only thing standing between that mutation and production.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    for (let i = 0; i < 20; i++) g.onOutputAudio(T0 + 100 + i * 100);
    assert.equal(g.onInterrupt(T0 + 2_200), false, "2s of greeting heard = a real barge-in");
  });

  it("a retry measures heard-time from ITS OWN audio, not the previous attempt's", () => {
    // Without the reset, attempt 2's heard-time is measured from attempt 1's
    // chunk, so a second fragment-cancel reads as a genuine barge-in and the
    // caller is left with no greeting and no recovery.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 100);
    assert.equal(g.onInterrupt(T0 + 300), true, "fragment heard → retry");
    g.onOutputAudio(T0 + 700);
    assert.equal(g.onInterrupt(T0 + 900), true, "another fragment → retry again, not 'barge-in'");
  });
});

describe("SCRUM-576: greeting guard — the production default must stay ON", () => {
  const withEnv = (value, fn) => {
    const prev = process.env.GREETING_GUARD;
    if (value === undefined) delete process.env.GREETING_GUARD;
    else process.env.GREETING_GUARD = value;
    try { return fn(); } finally {
      if (prev === undefined) delete process.env.GREETING_GUARD;
      else process.env.GREETING_GUARD = prev;
    }
  };

  it("defaults to ON when the env var is unset — the production path", () => {
    // Every other test injects `enabled` explicitly, so nothing else covers
    // greetingGuardEnabled(). A mutation there ships the whole fix DEAD with a
    // fully green suite.
    assert.equal(withEnv(undefined, greetingGuardEnabled), true);
    assert.equal(withEnv("", greetingGuardEnabled), true);
    assert.equal(withEnv("on", greetingGuardEnabled), true);
    assert.equal(withEnv("false", greetingGuardEnabled), true, "only 'off' disables — not any falsy-looking word");
  });

  it("only the documented kill switch disables it, case/space-insensitively", () => {
    assert.equal(withEnv("off", greetingGuardEnabled), false);
    assert.equal(withEnv("OFF", greetingGuardEnabled), false);
    assert.equal(withEnv("  off  ", greetingGuardEnabled), false);
  });

  it("a default-constructed guard is live (no args = production shape)", () => {
    withEnv(undefined, () => {
      const g = createGreetingGuard();
      g.onGreetingTriggered(T0);
      assert.equal(g.shouldHoldInbound(T0 + 100), true);
    });
  });
});

describe("SCRUM-576: greeting guard — the tuned constants are the contract", () => {
  it("holds are short enough that a caller is never meaningfully muted", () => {
    // Tests reference these symbolically, so proportional inflation (6s→40s
    // AND 9s→60s together) satisfies every relational assertion while muting a
    // caller for a minute. .env.example promises "6s per attempt, 9s absolute".
    assert.ok(GREETING_MAX_HOLD_MS <= 8_000, `per-attempt hold too long: ${GREETING_MAX_HOLD_MS}ms`);
    assert.ok(GREETING_ABSOLUTE_HOLD_CAP_MS <= 12_000, `absolute hold too long: ${GREETING_ABSOLUTE_HOLD_CAP_MS}ms`);
  });

  it("the barge-in threshold stays short enough to be a real barge-in", () => {
    // Inflating this replays the greeting over anyone who interrupts early.
    assert.ok(GREETING_MIN_HEARD_MS <= 1_500, `min-heard too long: ${GREETING_MIN_HEARD_MS}ms`);
  });
});

describe("SCRUM-576: greeting guard — a backward clock must not mute the caller", () => {
  it("stops holding if time moves backwards", () => {
    // Both elapsed comparisons go negative on a backward step, so both windows
    // would "pass" and the caller would stay muted until the clock caught up —
    // unbounded. Clamping the elapsed values to 0 does NOT fix it (0 is inside
    // both windows); the guard has to fail safe and release.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    assert.equal(g.shouldHoldInbound(T0 + 100), true, "normal forward time still holds");
    assert.equal(g.shouldHoldInbound(T0 - 5_000), false, "backward step must release the caller");
  });
});

describe("SCRUM-576: greeting guard — recovery expires with the greeting window", () => {
  it("a LATE interrupt cannot replay the greeting mid-call", () => {
    // If a greeting turn never emits audio and never completes, `armed` stayed
    // true for the whole call: an interrupt minutes later still saw heardMs=0
    // and re-injected the greeting over a live conversation.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    assert.equal(
      g.onInterrupt(T0 + GREETING_ABSOLUTE_HOLD_CAP_MS + 1),
      false,
      "past the absolute cap the greeting is over — never re-inject it"
    );
    assert.equal(g.shouldHoldInbound(T0 + GREETING_ABSOLUTE_HOLD_CAP_MS + 2), false);
  });

  it("an interrupt inside the attempt window still recovers", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    assert.equal(g.onInterrupt(T0 + GREETING_MAX_HOLD_MS - 1), true);
  });

  it("recovery ends at the PER-ATTEMPT bound, not just the absolute one", () => {
    // A greeting attempt that drew nothing for the whole hold window is dead.
    // Re-injecting it seconds later would talk over a caller who has by then
    // started speaking — the absolute cap alone is too loose a gate here.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    const pastAttemptInsideAbsolute = T0 + GREETING_MAX_HOLD_MS + 1;
    assert.ok(
      pastAttemptInsideAbsolute < T0 + GREETING_ABSOLUTE_HOLD_CAP_MS,
      "setup check: this instant must be past the attempt bound but inside the absolute cap"
    );
    assert.equal(g.onInterrupt(pastAttemptInsideAbsolute), false);
  });
});

describe("SCRUM-576: greeting guard — kill switch", () => {
  it("disabled: never holds and never re-triggers", () => {
    const g = createGreetingGuard({ enabled: false });
    g.onGreetingTriggered(T0);
    assert.equal(g.shouldHoldInbound(T0 + 1), false);
    assert.equal(g.onInterrupt(T0 + 354), false);
  });

  it("giving up raises an alertable notice, exactly once", () => {
    // When the retry cap is exhausted the caller is left in the ORIGINAL
    // failure state: no greeting, both sides silent. That must not be
    // invisible — being invisible is precisely why the first bug survived in
    // production. The call site turns this into a Sentry event, matching how
    // the CUSTOM_VAD fallback and marker failures escalate in the same file.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    let now = T0;
    for (let i = 0; i < GREETING_MAX_RETRIGGERS; i++) {
      now += 100;
      g.onInterrupt(now);
    }
    assert.equal(g.takeGiveUpNotice(), false, "no notice while re-triggering is still working");

    assert.equal(g.onInterrupt(now + 100), false, "this is the give-up");
    assert.equal(g.takeGiveUpNotice(), true, "the give-up must be reportable");
    assert.equal(g.takeGiveUpNotice(), false, "consumed — must not re-alert on every later barge-in");
  });

  it("a normal barge-in over an audible greeting raises NO alert", () => {
    // Paging on ordinary caller behaviour would train everyone to ignore it.
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onOutputAudio(T0 + 500);
    g.onInterrupt(T0 + 500 + GREETING_MIN_HEARD_MS + 1);
    assert.equal(g.takeGiveUpNotice(), false);
  });

  it("exposes counters for the session summary", () => {
    const g = createGreetingGuard({ enabled: true });
    g.onGreetingTriggered(T0);
    g.onInterrupt(T0 + 200);
    assert.equal(g.stats().retriggers, 1);
  });
});

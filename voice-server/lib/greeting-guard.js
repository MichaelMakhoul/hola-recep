/**
 * SCRUM-576: keep the greeting from being killed by room noise.
 *
 * A demo visitor sat through 17 seconds of "Call Active" and never heard the
 * AI. The Fly logs for that session:
 *
 *   10:31:58.866  [GeminiLive] Sent realtimeInput.text trigger for greeting
 *   10:31:59.220  [GeminiLive] User interrupted (barge-in)   <-- 354ms later
 *   10:32:19.511  [TestGeminiLive] Session closed            <-- 20s of silence
 *
 * Gemini's VAD read the caller's first-moment room noise as speech, cancelled
 * its own greeting turn before emitting a single audio chunk, then waited for
 * the caller to speak. The caller was waiting for the AI. Neither side moved,
 * nothing errored, and no alert fired — the session looks successful in every
 * metric we collect. The same greeting path serves real PHONE calls, so a noisy
 * line at pickup can strand a paying customer's caller the same way.
 *
 * Two mechanisms, in priority order:
 *
 *  1. PREVENT — hold inbound audio for the duration of the greeting turn.
 *     Noise that never reaches Gemini cannot trigger its VAD. This is also the
 *     answer to "filter out the room noise": during the greeting we do not
 *     filter noise from speech at all, we simply forward nothing, which is
 *     strictly more reliable than any threshold.
 *
 *  2. RECOVER — if a cancel still arrives before the caller heard anything,
 *     re-send the greeting trigger rather than going silent forever.
 *
 * Why prevention has to lead: `sc.interrupted` is Gemini telling us it has
 * ALREADY discarded its turn. Swallowing that callback locally would not
 * un-cancel anything — it would only stop us flushing our own audio buffer. So
 * suppression alone could never have fixed this bug.
 *
 * Every window is bounded. A caller muted by a guard that never disarms would
 * be a worse failure than the one being fixed, so holding stops at
 * GREETING_MAX_HOLD_MS per attempt and GREETING_ABSOLUTE_HOLD_CAP_MS across all
 * attempts, whatever Gemini does or does not send back.
 *
 * Kill switch: GREETING_GUARD=off restores the pre-SCRUM-576 behaviour exactly
 * (no holding, no re-triggering) without a redeploy of the calling code.
 */

/** Longest we hold inbound audio for a single greeting attempt. */
const GREETING_MAX_HOLD_MS = 6000;
/** Longest we hold inbound audio across ALL attempts, from the first arming. */
const GREETING_ABSOLUTE_HOLD_CAP_MS = 9000;
/** Audio the caller must have heard before a cancel counts as a real barge-in. */
const GREETING_MIN_HEARD_MS = 700;
/** How many times we re-send the greeting trigger before giving up. */
const GREETING_MAX_RETRIGGERS = 2;

/** @returns {boolean} whether the guard is active (default ON). */
function greetingGuardEnabled() {
  return String(process.env.GREETING_GUARD || "").trim().toLowerCase() !== "off";
}

/**
 * @typedef {Object} GreetingGuard
 * @property {(now: number) => void} onGreetingTriggered - the greeting trigger was sent
 * @property {(now: number) => void} onOutputAudio - a model audio chunk arrived
 * @property {(now: number) => boolean} onTurnComplete - true → re-send the greeting trigger
 * @property {(now: number) => boolean} shouldHoldInbound - true → drop this caller frame
 * @property {(now: number) => boolean} onInterrupt - true → re-send the greeting trigger
 * @property {() => boolean} takeGiveUpNotice - consume the "recovery exhausted" flag (true at most once)
 * @property {() => { armed: boolean, delivered: boolean, retriggers: number, silentTurns: number, heldFrames: number }} stats
 */

/**
 * @param {Object} [opts]
 * @param {boolean} [opts.enabled]
 * @param {number} [opts.maxHoldMs]
 * @param {number} [opts.absoluteHoldCapMs]
 * @param {number} [opts.minHeardMs]
 * @param {number} [opts.maxRetriggers]
 * @returns {GreetingGuard}
 */
function createGreetingGuard(opts = {}) {
  const enabled = opts.enabled !== undefined ? opts.enabled : greetingGuardEnabled();
  const maxHoldMs = opts.maxHoldMs !== undefined ? opts.maxHoldMs : GREETING_MAX_HOLD_MS;
  const absoluteHoldCapMs =
    opts.absoluteHoldCapMs !== undefined ? opts.absoluteHoldCapMs : GREETING_ABSOLUTE_HOLD_CAP_MS;
  const minHeardMs = opts.minHeardMs !== undefined ? opts.minHeardMs : GREETING_MIN_HEARD_MS;
  const maxRetriggers = opts.maxRetriggers !== undefined ? opts.maxRetriggers : GREETING_MAX_RETRIGGERS;

  // `armed` is true only between the greeting trigger and the moment the
  // greeting is resolved (delivered, barged over, or given up on). It is never
  // re-armed afterwards, so later turns — which also emit audio and
  // turnComplete — cannot drag the guard back to life mid-conversation.
  let armed = false;
  let delivered = false;
  let attemptStartedAt = 0; // re-armed per attempt
  let firstArmedAt = 0; // never moves — backs the absolute cap
  let audioStartedAt = null; // when the caller first heard this attempt
  let retriggers = 0;
  let giveUpNotice = false; // set once when recovery is exhausted; consumed by the call site
  let silentTurns = 0; // greeting turns that ended without the caller hearing anything
  let heldFrames = 0; // caller frames dropped while protecting the greeting

  /** Stop guarding: the greeting is resolved one way or another. */
  function disarm() {
    armed = false;
    audioStartedAt = null;
  }

  /**
   * The greeting window is TERMINAL once either bound is reached, whatever
   * Gemini did or did not send back. Applied at EVERY entry point, because
   * letting the caps merely stop the hold left `armed` true for the rest of
   * the call whenever an attempt drew no turnComplete at all — which is
   * exactly what the logged incident shows Gemini doing. An armed guard then
   * treats a LATER turn as the greeting: a mid-call turn ending without audio
   * routed straight into recovery and re-sent "Call connected." into a live
   * booking, minutes in.
   * @param {number} now
   */
  function settle(now) {
    if (!armed) return;
    if (now - attemptStartedAt >= maxHoldMs || now - firstArmedAt >= absoluteHoldCapMs) disarm();
  }

  /**
   * The current attempt failed before the caller heard a greeting. Start
   * another attempt, or give up (loudly) if recovery is exhausted.
   * Shared by BOTH failure signals — a cancelled turn (`interrupted`) and a
   * turn that simply ended without audio — because they are the same failure
   * wearing different hats, and handling only the first is how the original
   * bug survived its own fix.
   * @param {number} now
   * @returns {boolean} true → the call site should re-send the greeting trigger
   */
  function retryOrGiveUp(now) {
    if (retriggers >= maxRetriggers) {
      // The caller is now in the ORIGINAL failure state: no greeting, both
      // sides waiting. Flag it so the call site can escalate — silence here is
      // how the first bug survived in production for months. Release the
      // caller's audio too, so they can at least be heard.
      giveUpNotice = true;
      disarm();
      return false;
    }
    retriggers++;
    attemptStartedAt = now;
    audioStartedAt = null;
    return true;
  }

  return {
    onGreetingTriggered(now) {
      if (!enabled) return;
      // Defence in depth against a duplicate setupComplete (the call site gates
      // on firstAck, but this guard must not depend on that to stay safe):
      // re-arming after the greeting was delivered would make the next
      // ordinary mid-call barge-in look like "cancelled before the caller
      // heard it" and replay the greeting during a live conversation.
      if (delivered) return;
      armed = true;
      delivered = false;
      attemptStartedAt = now;
      if (!firstArmedAt) firstArmedAt = now;
      audioStartedAt = null;
    },

    onOutputAudio(now) {
      if (!armed) return; // a later turn's audio must not re-arm the guard
      settle(now);
      if (!armed) return;
      // FIRST chunk only: restamping on every chunk would keep heard-time near
      // zero for the whole greeting, so a barge-in seconds in would read as
      // "heard nothing" and replay the greeting over the caller.
      if (audioStartedAt === null) audioStartedAt = now;
    },

    onTurnComplete(now) {
      if (!armed) return false;
      settle(now);
      if (!armed) return false;
      if (audioStartedAt === null) {
        // The turn closed without the caller hearing a single chunk. Treating
        // that as "delivered" recorded a silent call as a success and left the
        // guard permanently inert. It is also how a STALE turnComplete for an
        // already-cancelled turn lands (gemini-live reads sc.interrupted and
        // sc.turnComplete off the same message, in that order), which would
        // otherwise disarm the retry we just started.
        silentTurns++;
        return retryOrGiveUp(now);
      }
      delivered = true;
      disarm();
      return false;
    },

    shouldHoldInbound(now) {
      if (!enabled || !armed) return false;
      // A clock that moved BACKWARDS makes both elapsed comparisons negative,
      // so both windows would "pass" and the caller would stay muted until the
      // clock caught up — unbounded, which is the outcome this guard exists to
      // prevent. Fail SAFE and stop holding. (Call sites pass a monotonic
      // clock, so this is unreachable there; it is here so the guard is safe
      // for any caller, including one that passes Date.now().)
      // NOTE: clamping the elapsed values to 0 instead does NOT work — 0 is
      // inside both windows, so it still returns "hold".
      if (now < attemptStartedAt || now < firstArmedAt) return false;
      // Both windows must hold: the per-attempt one bounds a stuck turn, the
      // absolute one bounds repeated re-triggers. settle() applies them once,
      // here and at every other entry point, so expiry RESOLVES the greeting
      // rather than just going quiet.
      settle(now);
      if (armed) heldFrames++;
      return armed;
    },

    onInterrupt(now) {
      if (!enabled || !armed) return false;

      // Recovery lives and dies with the greeting window (see settle): past
      // the caps an interrupt still looks like "cancelled before the caller
      // heard it", and re-injecting the greeting would talk over a live
      // conversation.
      settle(now);
      if (!armed) return false;

      const heardMs = audioStartedAt === null ? 0 : now - audioStartedAt;
      if (heardMs >= minHeardMs) {
        // The caller heard a real greeting and chose to talk over it. Replaying
        // it on top of them would be worse than the silence this guard exists
        // to prevent.
        disarm();
        return false;
      }

      return retryOrGiveUp(now);
    },

    /**
     * Consume the "recovery exhausted" flag. Returns true at most once per
     * session, so the call site alerts on the give-up itself rather than on
     * every subsequent barge-in of the call.
     * @returns {boolean}
     */
    takeGiveUpNotice() {
      if (!giveUpNotice) return false;
      giveUpNotice = false;
      return true;
    },

    stats() {
      return { armed, delivered, retriggers, silentTurns, heldFrames };
    },
  };
}

module.exports = {
  createGreetingGuard,
  greetingGuardEnabled,
  GREETING_MAX_HOLD_MS,
  GREETING_ABSOLUTE_HOLD_CAP_MS,
  GREETING_MIN_HEARD_MS,
  GREETING_MAX_RETRIGGERS,
};

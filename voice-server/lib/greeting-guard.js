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
 * @property {(now: number) => void} onTurnComplete - a model turn finished
 * @property {(now: number) => boolean} shouldHoldInbound - true → drop this caller frame
 * @property {(now: number) => boolean} onInterrupt - true → re-send the greeting trigger
 * @property {() => { armed: boolean, delivered: boolean, retriggers: number }} stats
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

  /** Stop guarding: the greeting is resolved one way or another. */
  function disarm() {
    armed = false;
    audioStartedAt = null;
  }

  return {
    onGreetingTriggered(now) {
      if (!enabled) return;
      armed = true;
      delivered = false;
      attemptStartedAt = now;
      if (!firstArmedAt) firstArmedAt = now;
      audioStartedAt = null;
    },

    onOutputAudio(now) {
      if (!armed) return; // a later turn's audio must not re-arm the guard
      if (audioStartedAt === null) audioStartedAt = now;
    },

    onTurnComplete() {
      if (!armed) return;
      delivered = true;
      disarm();
    },

    shouldHoldInbound(now) {
      if (!enabled || !armed) return false;
      // Both windows must hold: the per-attempt one bounds a stuck turn, the
      // absolute one bounds repeated re-triggers.
      return now - attemptStartedAt < maxHoldMs && now - firstArmedAt < absoluteHoldCapMs;
    },

    onInterrupt(now) {
      if (!enabled || !armed) return false;

      const heardMs = audioStartedAt === null ? 0 : now - audioStartedAt;
      if (heardMs >= minHeardMs) {
        // The caller heard a real greeting and chose to talk over it. Replaying
        // it on top of them would be worse than the silence this guard exists
        // to prevent.
        disarm();
        return false;
      }

      if (retriggers >= maxRetriggers) {
        // Something is persistently cancelling the greeting. Give up rather
        // than loop — and release the caller's audio so they can at least be
        // heard, which is the best remaining outcome.
        disarm();
        return false;
      }

      retriggers++;
      attemptStartedAt = now;
      audioStartedAt = null;
      return true;
    },

    stats() {
      return { armed, delivered, retriggers };
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

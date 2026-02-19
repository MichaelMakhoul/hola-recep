const { getSupabase } = require("./supabase");

/**
 * Create a call record when the call starts.
 * Stores the Twilio CallSid prefixed with "sh_" in the vapi_call_id column
 * (NOT NULL UNIQUE) to distinguish self-hosted calls from Vapi-originated ones.
 *
 * @returns {Promise<string|null>} The call record UUID, or null on failure
 */
async function createCallRecord({ orgId, assistantId, phoneNumberId, callerPhone, callSid }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("calls")
    .insert({
      organization_id: orgId,
      assistant_id: assistantId,
      phone_number_id: phoneNumberId,
      vapi_call_id: `sh_${callSid}`, // prefix to distinguish from Vapi call IDs
      caller_phone: callerPhone,
      direction: "inbound",
      status: "in-progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[CallLogger] Failed to create call record:", {
      callSid,
      orgId,
      error,
    });
    return null;
  }

  return data.id;
}

/**
 * Update the call record when the call ends.
 * Throws on failure so the caller can handle it.
 */
async function completeCallRecord(callId, { status, durationSeconds, transcript }) {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("calls")
    .update({
      status: status || "completed",
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      transcript: transcript || null,
      metadata: {
        voice_provider: "self_hosted",
      },
    })
    .eq("id", callId);

  if (error) {
    throw new Error(`Failed to complete call record ${callId}: ${error.message}`);
  }
}

/**
 * Increment call usage for billing.
 * Uses the same atomic RPC + error-code fallback pattern as billing-service.ts,
 * but simplified: no shouldUpgrade check or return value.
 */
async function incrementUsage(orgId) {
  const supabase = getSupabase();

  const { data: result, error } = await supabase.rpc("increment_call_usage", {
    org_id: orgId,
  });

  // Fallback if RPC doesn't exist (error 42883 = undefined_function, PGRST202 = PostgREST)
  if (error && (error.code === "42883" || error.code === "PGRST202")) {
    console.warn("[CallLogger] increment_call_usage RPC not found, using fallback");

    const { data: subscription, error: selectError } = await supabase
      .from("subscriptions")
      .select("id, calls_used, calls_limit")
      .eq("organization_id", orgId)
      .single();

    if (selectError || !subscription) {
      console.error("[CallLogger] No subscription found for org:", { orgId, error: selectError });
      return;
    }

    const newUsage = (subscription.calls_used || 0) + 1;
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ calls_used: newUsage })
      .eq("id", subscription.id);

    if (updateError) {
      console.error("[CallLogger] Failed to update subscription usage (billing may be inaccurate):", {
        orgId,
        subscriptionId: subscription.id,
        attemptedUsage: newUsage,
        error: updateError,
      });
    }

    return;
  }

  if (error) {
    console.error("[CallLogger] Failed to increment usage:", { orgId, error });
  }
}

/**
 * POST to the Next.js internal endpoint for post-call processing
 * (spam analysis, billing, notifications, webhook delivery).
 * Called with .catch() at the call site for fire-and-forget behavior.
 */
async function notifyCallCompleted(internalApiUrl, secret, payload) {
  try {
    const res = await fetch(`${internalApiUrl}/api/internal/call-completed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      console.error("[CallLogger] Internal API error:", { status: res.status, body: text });
    }
  } catch (err) {
    console.error("[CallLogger] Failed to notify call completed:", err.message);
  }
}

module.exports = {
  createCallRecord,
  completeCallRecord,
  incrementUsage,
  notifyCallCompleted,
};

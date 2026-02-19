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
      metadata: { voice_provider: "self_hosted" },
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

  // Don't touch metadata here — it was set at insert time and the internal
  // endpoint may concurrently merge spam analysis results into it.
  const { error } = await supabase
    .from("calls")
    .update({
      status: status || "completed",
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      transcript: transcript || null,
    })
    .eq("id", callId);

  if (error) {
    throw new Error(`Failed to complete call record ${callId}: ${error.message}`);
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
  notifyCallCompleted,
};

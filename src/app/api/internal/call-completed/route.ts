import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeCall, type CallMetadata } from "@/lib/spam/spam-detector";
import {
  sendMissedCallNotification,
  sendFailedCallNotification,
} from "@/lib/notifications/notification-service";
import { deliverWebhooks } from "@/lib/integrations/webhook-delivery";
import { withRateLimit } from "@/lib/security/rate-limiter";

function verifyInternalSecret(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error("[Internal] INTERNAL_API_SECRET is not configured — all internal API requests will be rejected");
    return false;
  }

  const headerSecret = request.headers.get("X-Internal-Secret");
  if (!headerSecret) return false;

  const secretBuffer = Buffer.from(secret);
  const headerBuffer = Buffer.from(headerSecret);
  if (secretBuffer.length !== headerBuffer.length) return false;

  return crypto.timingSafeEqual(secretBuffer, headerBuffer);
}

interface CallCompletedPayload {
  callId: string | null;
  organizationId: string;
  assistantId: string;
  callerPhone: string;
  status: string;
  durationSeconds: number;
  transcript?: string;
  endedReason?: string;
}

/**
 * Internal endpoint called by the self-hosted voice server after a call ends.
 * Runs spam analysis, updates call record, increments billing, sends notifications, and delivers webhooks.
 */
export async function POST(request: Request) {
  // Rate limit
  const { allowed, headers: rlHeaders } = withRateLimit(request, "/api/internal/call-completed", "webhook");
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rlHeaders });
  }

  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: CallCompletedPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    callId,
    organizationId,
    assistantId,
    callerPhone,
    status,
    durationSeconds,
    transcript,
    endedReason,
  } = payload;

  if (!organizationId) {
    return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Run spam analysis
  let spamAnalysis = null;
  let spamAnalysisFailed = false;
  if (callerPhone) {
    const spamMetadata: CallMetadata = {
      callerPhone,
      organizationId,
      timestamp: new Date(),
      duration: durationSeconds,
      transcript,
    };

    try {
      spamAnalysis = await analyzeCall(spamMetadata);
      console.log("[Internal] Spam analysis:", {
        callId,
        isSpam: spamAnalysis.isSpam,
        score: spamAnalysis.spamScore,
        recommendation: spamAnalysis.recommendation,
      });
    } catch (err) {
      console.error("[Internal] Spam analysis failed — call will be treated as non-spam:", err);
      spamAnalysisFailed = true;
    }
  }

  // 2. Update call record with spam results (merge metadata, don't overwrite)
  if (callId && spamAnalysis) {
    // Read existing metadata first to merge
    const { data: existingCall } = await (supabase as any)
      .from("calls")
      .select("metadata")
      .eq("id", callId)
      .single();

    const existingMetadata = existingCall?.metadata || {};
    const { error: updateError } = await (supabase as any)
      .from("calls")
      .update({
        is_spam: spamAnalysis.isSpam,
        spam_score: spamAnalysis.spamScore,
        metadata: {
          ...existingMetadata,
          endedReason,
          spamAnalysis: {
            reasons: spamAnalysis.reasons,
            confidence: spamAnalysis.confidence,
            recommendation: spamAnalysis.recommendation,
          },
        },
      })
      .eq("id", callId);

    if (updateError) {
      console.error("[Internal] Failed to update call with spam data:", { callId, error: updateError });
    }
  }

  // 3. Increment billing (skip spam calls, matching Vapi flow)
  const shouldTrackUsage = status === "completed" &&
    (!spamAnalysis?.isSpam || spamAnalysis?.recommendation !== "block");

  if (shouldTrackUsage) {
    try {
      const { data: result, error: rpcError } = await (supabase as any).rpc("increment_call_usage", {
        org_id: organizationId,
      });

      // Fallback if RPC doesn't exist
      if (rpcError && (rpcError.code === "42883" || rpcError.code === "PGRST202")) {
        console.warn("[Internal] increment_call_usage RPC not found, using fallback");
        const { data: subscription } = await (supabase as any)
          .from("subscriptions")
          .select("id, calls_used")
          .eq("organization_id", organizationId)
          .single();

        if (subscription) {
          const { error: updateError } = await (supabase as any)
            .from("subscriptions")
            .update({ calls_used: (subscription.calls_used || 0) + 1 })
            .eq("id", subscription.id);
          if (updateError) {
            console.error("[Internal] Failed to update subscription usage:", { organizationId, error: updateError });
          }
        }
      } else if (rpcError) {
        console.error("[Internal] Failed to increment usage:", { organizationId, error: rpcError });
      }
    } catch (err) {
      console.error("[Internal] Billing increment failed:", err);
    }
  }

  // 4. Send notifications (skip spam calls)
  let notificationStatus = "skipped";
  if (!spamAnalysis?.isSpam) {
    try {
      if (status === "failed") {
        await sendFailedCallNotification({
          organizationId,
          callId: callId || "unknown",
          callerPhone: callerPhone || "Unknown",
          timestamp: new Date(),
          duration: durationSeconds,
          transcript,
          failureReason: humanizeEndedReason(endedReason),
          endedReason,
        });
        notificationStatus = "sent";
      } else if (durationSeconds < 10) {
        // Very short calls are likely missed
        await sendMissedCallNotification({
          organizationId,
          callId: callId || "unknown",
          callerPhone: callerPhone || "Unknown",
          timestamp: new Date(),
          duration: durationSeconds,
        });
        notificationStatus = "sent";
      }
    } catch (err) {
      console.error("[Internal] Failed to send notification — business owner will NOT be alerted:", {
        callId, organizationId, status, error: err,
      });
      notificationStatus = "failed";
    }

    if (spamAnalysisFailed && notificationStatus === "sent") {
      console.warn("[Internal] Notification sent despite spam analysis failure — may be for a spam call:", { callId });
    }
  }

  // 5. Deliver webhooks to user integrations
  let assistantName: string | null = null;
  if (assistantId) {
    const { data: assistantRecord, error: assistantError } = await (supabase as any)
      .from("assistants")
      .select("name")
      .eq("id", assistantId)
      .single();
    if (assistantError) {
      console.error("[Internal] Failed to look up assistant name for webhook:", { assistantId, error: assistantError });
    }
    if (assistantRecord) assistantName = assistantRecord.name;
  }

  // Map "failed" status to "call.missed" webhook event since there is no
  // "call.failed" event type — from the customer's perspective, a failed
  // call is functionally equivalent to a missed one.
  const webhookEvent = status === "failed"
    ? "call.missed" as const
    : "call.completed" as const;

  deliverWebhooks(organizationId, webhookEvent, {
    callId: callId || "unknown",
    caller: callerPhone || "Unknown",
    transcript,
    duration: durationSeconds,
    assistantName,
    outcome: status,
  }).catch((err) => console.error("[Internal] Webhook delivery failed:", err));

  return NextResponse.json({ received: true, notificationStatus });
}

function humanizeEndedReason(endedReason: string | undefined): string {
  switch (endedReason) {
    case "stt-error":
      return "The speech recognition system failed during the call.";
    case "llm-error":
      return "The AI assistant encountered a technical error and couldn't respond.";
    case "tts-error":
      return "The voice system failed during the call.";
    case "server-error":
      return "The voice server encountered an error processing the call.";
    default:
      if (!endedReason) return "The call ended unexpectedly for an unknown reason.";
      // Only use known safe characters in the reason string
      const safeReason = endedReason.substring(0, 100).replace(/[<>&"']/g, "");
      return `The call ended unexpectedly (${safeReason}).`;
  }
}

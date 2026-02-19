import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeCall, type CallMetadata } from "@/lib/spam/spam-detector";
import {
  sendMissedCallNotification,
  sendFailedCallNotification,
} from "@/lib/notifications/notification-service";
import { deliverWebhooks } from "@/lib/integrations/webhook-delivery";

function verifyInternalSecret(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;

  const headerSecret = request.headers.get("X-Internal-Secret");
  if (!headerSecret) return false;

  const secretBuffer = Buffer.from(secret);
  const headerBuffer = Buffer.from(headerSecret);
  if (secretBuffer.length !== headerBuffer.length) return false;

  return crypto.timingSafeEqual(secretBuffer, headerBuffer);
}

interface CallCompletedPayload {
  callId: string;
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
 * Runs spam analysis, updates call record, sends notifications, and delivers webhooks.
 */
export async function POST(request: Request) {
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

  if (!callId || !organizationId) {
    return NextResponse.json({ error: "Missing callId or organizationId" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Run spam analysis
  let spamAnalysis = null;
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
      console.error("[Internal] Spam analysis failed:", err);
    }
  }

  // 2. Update call record with spam results
  if (spamAnalysis) {
    const { error: updateError } = await (supabase as any)
      .from("calls")
      .update({
        is_spam: spamAnalysis.isSpam,
        spam_score: spamAnalysis.spamScore,
        metadata: {
          voice_provider: "self_hosted",
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
      console.error("[Internal] Failed to update call with spam data:", updateError);
    }
  }

  // 3. Send notifications (skip spam calls)
  if (!spamAnalysis?.isSpam) {
    try {
      if (status === "failed") {
        await sendFailedCallNotification({
          organizationId,
          callId,
          callerPhone: callerPhone || "Unknown",
          timestamp: new Date(),
          duration: durationSeconds,
          transcript,
          failureReason: humanizeEndedReason(endedReason),
          endedReason,
        });
      } else if (durationSeconds < 10) {
        // Very short calls are likely missed
        await sendMissedCallNotification({
          organizationId,
          callId,
          callerPhone: callerPhone || "Unknown",
          timestamp: new Date(),
          duration: durationSeconds,
        });
      }
    } catch (err) {
      console.error("[Internal] Failed to send notification:", err);
    }
  }

  // 4. Deliver webhooks to user integrations (fire-and-forget)
  let assistantName: string | null = null;
  if (assistantId) {
    const { data: assistantRecord } = await (supabase as any)
      .from("assistants")
      .select("name")
      .eq("id", assistantId)
      .single();
    if (assistantRecord) assistantName = assistantRecord.name;
  }

  const webhookEvent = status === "failed"
    ? "call.missed" as const
    : "call.completed" as const;

  deliverWebhooks(organizationId, webhookEvent, {
    callId,
    caller: callerPhone || "Unknown",
    transcript,
    duration: durationSeconds,
    assistantName,
    outcome: status,
  }).catch((err) => console.error("[Internal] Webhook delivery failed:", err));

  return NextResponse.json({ received: true });
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
      return endedReason
        ? `The call ended unexpectedly (${endedReason.substring(0, 100)}).`
        : "The call ended unexpectedly for an unknown reason.";
  }
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { analyzeCall, type CallMetadata } from "@/lib/spam/spam-detector";
import { sendMissedCallNotification, sendVoicemailNotification } from "@/lib/notifications/notification-service";
import { incrementCallUsage, canMakeCall } from "@/lib/stripe/billing-service";
import { withRateLimit } from "@/lib/security/rate-limiter";
import {
  handleBookAppointment,
  handleCheckAvailability,
  handleCancelAppointment,
} from "@/lib/calendar/tool-handlers";

// Verify Vapi webhook signature
function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Prevent timing attacks by checking lengths first
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

interface VapiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

interface VapiCallEvent {
  message: {
    type: string;
    call?: {
      id: string;
      orgId: string;
      assistantId?: string;
      phoneNumberId?: string;
      type: string;
      status: string;
      endedReason?: string;
      startedAt?: string;
      endedAt?: string;
      customer?: {
        number?: string;
      };
      transcript?: string;
      recordingUrl?: string;
      summary?: string;
      cost?: number;
      metadata?: Record<string, unknown>;
      analysis?: {
        summary?: string;
        structuredData?: Record<string, unknown>;
        successEvaluation?: string;
      };
    };
    toolCallList?: VapiToolCall[];
    transcript?: string;
    artifact?: {
      transcript?: string;
      recordingUrl?: string;
      summary?: string;
    };
    analysis?: {
      summary?: string;
    };
    costBreakdown?: {
      total?: number;
    };
  };
}

// Map Vapi status to our status
function mapStatus(vapiStatus: string): string {
  const statusMap: Record<string, string> = {
    queued: "queued",
    ringing: "ringing",
    "in-progress": "in-progress",
    forwarding: "in-progress",
    ended: "completed",
  };
  return statusMap[vapiStatus] || "completed";
}

// POST /api/webhooks/vapi - Handle Vapi webhook events
export async function POST(request: Request) {
  try {
    // Rate limit - webhook endpoints (high volume)
    const { allowed, headers } = withRateLimit(request, "/api/webhooks/vapi", "webhook");
    if (!allowed) {
      console.error("Vapi webhook rate limited");
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers }
      );
    }

    const payload = await request.text();
    const signature = request.headers.get("x-vapi-signature");

    // SECURITY: Always verify webhook signature
    // Only skip in explicit test mode with TEST_MODE=true
    const skipVerification = process.env.TEST_MODE === "true" && process.env.NODE_ENV !== "production";

    if (!skipVerification) {
      if (!process.env.VAPI_WEBHOOK_SECRET) {
        console.error("VAPI_WEBHOOK_SECRET not configured - rejecting webhook");
        return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
      }

      if (!verifySignature(payload, signature)) {
        console.error("Invalid webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event: VapiCallEvent = JSON.parse(payload);
    const supabase = createAdminClient();

    console.log("Vapi webhook received:", event.message.type);

    // Handle different event types
    switch (event.message.type) {
      case "call.started":
      case "call-started": {
        const call = event.message.call;
        if (!call) break;

        // Find our phone number by Vapi phone number ID
        const { data: phoneNumber } = await (supabase
          .from("phone_numbers") as any)
          .select("id, organization_id, assistant_id")
          .eq("vapi_phone_number_id", call.phoneNumberId)
          .single();

        if (!phoneNumber) {
          console.error("Phone number not found for Vapi ID:", call.phoneNumberId);
          break;
        }

        // Find our assistant by Vapi assistant ID
        let assistantId = phoneNumber.assistant_id;
        if (call.assistantId) {
          const { data: assistant } = await (supabase
            .from("assistants") as any)
            .select("id")
            .eq("vapi_assistant_id", call.assistantId)
            .single();
          if (assistant) {
            assistantId = assistant.id;
          }
        }

        // Create call record
        await (supabase.from("calls") as any).insert({
          organization_id: phoneNumber.organization_id,
          assistant_id: assistantId,
          phone_number_id: phoneNumber.id,
          vapi_call_id: call.id,
          caller_phone: call.customer?.number,
          direction: call.type === "outbound" ? "outbound" : "inbound",
          status: mapStatus(call.status),
          started_at: call.startedAt,
        });

        break;
      }

      case "call.ended":
      case "call-ended": {
        const call = event.message.call;
        if (!call) break;

        // Calculate duration
        let durationSeconds: number | null = null;
        if (call.startedAt && call.endedAt) {
          const start = new Date(call.startedAt).getTime();
          const end = new Date(call.endedAt).getTime();
          durationSeconds = Math.round((end - start) / 1000);
        }

        // Get transcript and summary from various places in the event
        const transcript =
          call.transcript ||
          event.message.artifact?.transcript ||
          event.message.transcript;
        const summary =
          call.summary ||
          event.message.artifact?.summary ||
          call.analysis?.summary ||
          event.message.analysis?.summary;
        const recordingUrl =
          call.recordingUrl || event.message.artifact?.recordingUrl;
        const cost =
          call.cost || event.message.costBreakdown?.total;

        // Get the call record to find organization_id
        const { data: existingCall } = await (supabase
          .from("calls") as any)
          .select("id, organization_id, caller_phone")
          .eq("vapi_call_id", call.id)
          .single();

        // Run spam analysis
        let spamAnalysis = null;
        if (existingCall && call.customer?.number) {
          const spamMetadata: CallMetadata = {
            callerPhone: call.customer.number,
            organizationId: existingCall.organization_id,
            timestamp: call.startedAt ? new Date(call.startedAt) : new Date(),
            duration: durationSeconds ?? undefined,
            transcript: transcript ?? undefined,
          };

          try {
            spamAnalysis = await analyzeCall(spamMetadata);
            console.log("Spam analysis result:", {
              callId: call.id,
              isSpam: spamAnalysis.isSpam,
              score: spamAnalysis.spamScore,
              recommendation: spamAnalysis.recommendation,
            });
          } catch (error) {
            console.error("Spam analysis failed:", error);
          }
        }

        // Determine call status
        const callStatus = call.endedReason === "customer-ended" || call.endedReason === "assistant-ended"
          ? "completed"
          : call.endedReason === "no-answer"
          ? "no-answer"
          : call.endedReason === "busy"
          ? "busy"
          : "completed";

        // Extract structured caller data from Vapi analysis
        const collectedData = call.analysis?.structuredData ?? null;
        const successEvaluation = call.analysis?.successEvaluation ?? null;

        // Extract caller_name from structured data if available
        const callerName =
          (collectedData as Record<string, unknown> | null)?.full_name as string | undefined ??
          (collectedData as Record<string, unknown> | null)?.name as string | undefined ??
          null;

        // Update call record with spam analysis and collected data
        await (supabase
          .from("calls") as any)
          .update({
            status: callStatus,
            ended_at: call.endedAt,
            duration_seconds: durationSeconds,
            transcript,
            recording_url: recordingUrl,
            summary,
            cost_cents: cost ? Math.round(cost * 100) : null,
            is_spam: spamAnalysis?.isSpam ?? false,
            spam_score: spamAnalysis?.spamScore ?? null,
            ...(collectedData && { collected_data: collectedData }),
            ...(callerName && { caller_name: callerName }),
            metadata: {
              endedReason: call.endedReason,
              analysis: call.analysis,
              successEvaluation,
              spamAnalysis: spamAnalysis ? {
                reasons: spamAnalysis.reasons,
                confidence: spamAnalysis.confidence,
                recommendation: spamAnalysis.recommendation,
              } : null,
            },
          })
          .eq("vapi_call_id", call.id);

        // Increment call usage for billing (skip for spam calls)
        // Using call-based pricing: each answered call counts as 1, regardless of duration
        const shouldTrackUsage = callStatus === "completed" &&
          (!spamAnalysis?.isSpam || spamAnalysis?.recommendation !== "block");

        if (shouldTrackUsage && existingCall) {
          const { success, shouldUpgrade } = await incrementCallUsage(existingCall.organization_id);
          if (shouldUpgrade) {
            console.log(`Organization ${existingCall.organization_id} approaching call limit`);
            // In production, you might want to send a notification here
          }
        }

        // Send notifications based on call outcome (skip for spam)
        if (existingCall && !spamAnalysis?.isSpam) {
          // Check if this was a missed call (no answer or very short duration)
          if (callStatus === "no-answer" || (durationSeconds !== null && durationSeconds < 10)) {
            await sendMissedCallNotification({
              organizationId: existingCall.organization_id,
              callId: existingCall.id,
              callerPhone: call.customer?.number || "Unknown",
              timestamp: call.startedAt ? new Date(call.startedAt) : new Date(),
              duration: durationSeconds ?? undefined,
              summary: summary ?? undefined,
            }).catch((err) => console.error("Failed to send missed call notification:", err));
          }

          // Check if there's a voicemail (recording URL with short duration could be voicemail)
          if (recordingUrl && durationSeconds && durationSeconds < 120 && durationSeconds > 10) {
            // This heuristic assumes voicemails are typically 10-120 seconds
            // In production, you'd have a separate voicemail detection mechanism
            await sendVoicemailNotification({
              organizationId: existingCall.organization_id,
              callId: existingCall.id,
              callerPhone: call.customer?.number || "Unknown",
              timestamp: call.startedAt ? new Date(call.startedAt) : new Date(),
              duration: durationSeconds,
              voicemailUrl: recordingUrl,
              voicemailTranscript: transcript ?? undefined,
            }).catch((err) => console.error("Failed to send voicemail notification:", err));
          }
        }

        break;
      }

      case "transcript":
      case "transcript-update": {
        const call = event.message.call;
        const transcript = event.message.transcript;
        if (!call || !transcript) break;

        await (supabase
          .from("calls") as any)
          .update({ transcript })
          .eq("vapi_call_id", call.id);

        break;
      }

      case "status-update": {
        const call = event.message.call;
        if (!call) break;

        await (supabase
          .from("calls") as any)
          .update({ status: mapStatus(call.status) })
          .eq("vapi_call_id", call.id);

        break;
      }

      case "tool-calls": {
        const toolCallList = event.message.toolCallList;
        const call = event.message.call;
        if (!toolCallList || !call) break;

        // Get organizationId from call metadata or DB lookup
        let organizationId =
          (call.metadata?.organizationId as string) || null;

        if (!organizationId) {
          const { data: existingCall } = await (supabase
            .from("calls") as any)
            .select("organization_id")
            .eq("vapi_call_id", call.id)
            .single();

          organizationId = existingCall?.organization_id || null;
        }

        if (!organizationId) {
          // Last resort: look up via phone number
          const { data: phoneNumber } = await (supabase
            .from("phone_numbers") as any)
            .select("organization_id")
            .eq("vapi_phone_number_id", call.phoneNumberId)
            .single();

          organizationId = phoneNumber?.organization_id || null;
        }

        if (!organizationId) {
          console.error("Could not determine organization for tool call, call ID:", call.id);
          return NextResponse.json({
            results: toolCallList.map((tc) => ({
              toolCallId: tc.id,
              result: "I'm sorry, I'm having a technical issue right now. Please try again.",
            })),
          });
        }

        const results = [];

        for (const toolCall of toolCallList) {
          const args =
            typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;

          let result: { success: boolean; message: string };

          switch (toolCall.function.name) {
            case "book_appointment":
              result = await handleBookAppointment(organizationId, args);
              break;
            case "check_availability":
              result = await handleCheckAvailability(organizationId, args);
              break;
            case "cancel_appointment":
              result = await handleCancelAppointment(organizationId, args);
              break;
            default:
              console.log("Unknown tool call:", toolCall.function.name);
              result = {
                success: false,
                message: "I'm sorry, I can't perform that action right now.",
              };
          }

          results.push({
            toolCallId: toolCall.id,
            result: result.message,
          });
        }

        return NextResponse.json({ results });
      }

      default:
        console.log("Unhandled event type:", event.message.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

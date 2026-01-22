import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

// Verify Vapi webhook signature
function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
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
      analysis?: {
        summary?: string;
        structuredData?: Record<string, unknown>;
      };
    };
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
    const payload = await request.text();
    const signature = request.headers.get("x-vapi-signature");

    // Verify signature in production
    if (process.env.NODE_ENV === "production" && process.env.VAPI_WEBHOOK_SECRET) {
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

        // Update call record
        await (supabase
          .from("calls") as any)
          .update({
            status: call.endedReason === "customer-ended" || call.endedReason === "assistant-ended"
              ? "completed"
              : call.endedReason === "no-answer"
              ? "no-answer"
              : call.endedReason === "busy"
              ? "busy"
              : "completed",
            ended_at: call.endedAt,
            duration_seconds: durationSeconds,
            transcript,
            recording_url: recordingUrl,
            summary,
            cost_cents: cost ? Math.round(cost * 100) : null,
            metadata: {
              endedReason: call.endedReason,
              analysis: call.analysis,
            },
          })
          .eq("vapi_call_id", call.id);

        // Create usage record for billing
        if (durationSeconds && durationSeconds > 0) {
          const { data: callRecord } = await (supabase
            .from("calls") as any)
            .select("id, organization_id")
            .eq("vapi_call_id", call.id)
            .single();

          if (callRecord) {
            const minutesUsed = Math.ceil(durationSeconds / 60);
            await (supabase.from("usage_records") as any).insert({
              organization_id: callRecord.organization_id,
              call_id: callRecord.id,
              period_start: call.startedAt,
              period_end: call.endedAt,
              minutes_used: minutesUsed,
              cost_cents: cost ? Math.round(cost * 100) : 0,
            });
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

import { NextRequest, NextResponse } from "next/server";
import {
  processTransfer,
  type TransferRequest,
} from "@/lib/transfer/transfer-service";
import {
  sendMissedCallNotification,
} from "@/lib/notifications/notification-service";
import {
  verifyWebhookSecret,
  isValidUUID,
  sanitizeString,
} from "@/lib/security/validation";

// Verify Vapi tool request (shared secret)
function verifyVapiRequest(request: NextRequest): { valid: boolean; error?: string } {
  const vapiSecret = process.env.VAPI_TOOL_SECRET;
  const requestSecret = request.headers.get("x-vapi-secret");

  // Only skip verification in explicit test mode
  const skipVerification = process.env.TEST_MODE === "true" && process.env.NODE_ENV !== "production";

  if (skipVerification) {
    return { valid: true };
  }

  return verifyWebhookSecret(requestSecret, vapiSecret, true);
}

/**
 * POST /api/v1/transfer
 *
 * Process a call transfer request
 * Called by Vapi as a tool during calls
 *
 * Body:
 * - organizationId: string
 * - assistantId: string
 * - callId: string
 * - callerPhone: string
 * - reason: string
 * - urgency: "low" | "medium" | "high"
 * - summary?: string
 * - transcript?: string
 */
export async function POST(request: NextRequest) {
  try {
    // Verify request is from Vapi
    const verification = verifyVapiRequest(request);
    if (!verification.valid) {
      console.error("Vapi request verification failed:", verification.error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      organizationId,
      assistantId,
      callId,
      callerPhone,
      reason,
      urgency = "low",
      summary,
      transcript,
    } = body;

    // Validate required fields and format
    if (!organizationId || !isValidUUID(organizationId)) {
      return NextResponse.json(
        {
          success: false,
          message: "I'm sorry, I'm having trouble connecting you right now. Can I take your information and have someone call you back?",
        },
        { status: 400 }
      );
    }

    if (!assistantId || !isValidUUID(assistantId)) {
      return NextResponse.json(
        {
          success: false,
          message: "I'm sorry, I'm having trouble connecting you right now. Can I take your information and have someone call you back?",
        },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json(
        {
          success: false,
          message: "Let me connect you with someone who can help. Please hold for just a moment.",
        },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const sanitizedReason = sanitizeString(reason, 200);
    const sanitizedSummary = summary ? sanitizeString(summary, 500) : undefined;

    // Process the transfer
    const transferRequest: TransferRequest = {
      organizationId,
      assistantId,
      callId: callId || "",
      callerPhone: callerPhone || "",
      reason: sanitizedReason,
      urgency: urgency as "low" | "medium" | "high",
      summary: sanitizedSummary,
      transcript,
    };

    const result = await processTransfer(transferRequest);

    // If transfer to callback, send notification to business owner
    if (result.action === "callback" && organizationId) {
      await sendMissedCallNotification({
        organizationId,
        callId: callId || "",
        callerPhone: callerPhone || "Unknown",
        timestamp: new Date(),
        summary: `Transfer requested: ${reason}. ${summary || ""}`,
      }).catch((err) => {
        console.error("Failed to send transfer notification:", err);
      });
    }

    // Return result for Vapi to use
    // The message is what the AI will say to the caller
    // For actual transfers, Vapi will use the transferTo phone number
    return NextResponse.json({
      success: result.success,
      action: result.action,
      message: result.message,
      transferTo: result.transferTo,
      transferToName: result.transferToName,
    });
  } catch (error) {
    console.error("Transfer error:", error);

    return NextResponse.json({
      success: false,
      action: "callback",
      message: "I apologize, but I'm having some technical difficulties. Can I take your phone number and have someone call you back shortly?",
    });
  }
}

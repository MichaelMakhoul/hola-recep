import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCalComClient,
  formatAvailabilityForVoice,
} from "@/lib/calendar/cal-com";
import {
  verifyWebhookSecret,
  isValidUUID,
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
 * POST /api/v1/calendar/check-availability
 *
 * Check available appointment slots for a specific date
 * Called by Vapi as a tool during calls
 *
 * Body:
 * - organizationId: string (from Vapi call metadata)
 * - date: string (YYYY-MM-DD format)
 * - eventType?: string (optional event type name)
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
    const { organizationId, date } = body;

    // Validate required fields and format
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    if (!isValidUUID(organizationId)) {
      return NextResponse.json(
        { error: "Invalid organization ID format" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: "Date is required" },
        { status: 400 }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        {
          error: "Invalid date format",
          message: "I need the date in YYYY-MM-DD format. For example, 2024-01-15.",
        },
        { status: 400 }
      );
    }

    // Get Cal.com client
    const calClient = await getCalComClient(organizationId);

    if (!calClient) {
      return NextResponse.json({
        success: false,
        message: "I'm sorry, calendar booking is not currently available. Would you like to leave a message and have someone call you back to schedule an appointment?",
      });
    }

    // Get calendar integration to find the event type ID
    const supabase = createAdminClient();
    const { data: integration } = await (supabase as any)
      .from("calendar_integrations")
      .select("calendar_id, settings")
      .eq("organization_id", organizationId)
      .eq("provider", "cal_com")
      .eq("is_active", true)
      .single();

    if (!integration || !integration.calendar_id) {
      return NextResponse.json({
        success: false,
        message: "I'm sorry, the calendar is not fully configured yet. Would you like to leave your contact information and have someone call you back?",
      });
    }

    const eventTypeId = parseInt(integration.calendar_id, 10);
    if (isNaN(eventTypeId)) {
      return NextResponse.json({
        success: false,
        message: "I'm sorry, there's a configuration issue with the calendar. Let me take your information and have someone call you back.",
      });
    }

    // Calculate date range (check the full day)
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    // Get availability
    const availability = await calClient.getAvailability({
      eventTypeId,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    });

    // Format response for voice
    const voiceResponse = formatAvailabilityForVoice(availability);

    return NextResponse.json({
      success: true,
      message: voiceResponse,
      data: {
        date,
        availability,
        eventTypeId,
      },
    });
  } catch (error: any) {
    console.error("Check availability error:", error);

    // Return a friendly message for voice
    // Log error server-side but don't expose details to client
    console.error("Check availability error details:", error.message);

    return NextResponse.json({
      success: false,
      message: "I'm having trouble checking the calendar right now. Would you like me to take your information and have someone call you back to schedule?",
    });
  }
}

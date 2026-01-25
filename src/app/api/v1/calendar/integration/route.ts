import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  saveCalendarIntegration,
  deleteCalendarIntegration,
} from "@/lib/calendar/cal-com";

/**
 * POST /api/v1/calendar/integration
 *
 * Save or update Cal.com integration
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, apiKey, eventTypeId, assistantId, bookingUrl } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // Verify user belongs to this organization
    const { data: membership } = await (supabase as any)
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied to this organization" },
        { status: 403 }
      );
    }

    if (!eventTypeId) {
      return NextResponse.json(
        { error: "Event type ID is required" },
        { status: 400 }
      );
    }

    // Check if integration exists (for partial updates)
    const supabaseAdmin = createAdminClient();
    const { data: existing } = await (supabaseAdmin as any)
      .from("calendar_integrations")
      .select("id, access_token")
      .eq("organization_id", organizationId)
      .eq("provider", "cal_com")
      .single();

    // API key required for new connections
    if (!existing && !apiKey) {
      return NextResponse.json(
        { error: "API key is required for new connections" },
        { status: 400 }
      );
    }

    // Save the integration
    const success = await saveCalendarIntegration(organizationId, {
      apiKey: apiKey || existing?.access_token, // Use existing if not provided
      eventTypeId,
      assistantId: assistantId || undefined,
      bookingUrl: bookingUrl || undefined,
    });

    if (!success) {
      return NextResponse.json(
        { error: "Failed to save calendar integration" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Save calendar integration error:", error);
    return NextResponse.json(
      { error: "Failed to save calendar integration" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/calendar/integration
 *
 * Remove Cal.com integration
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // Verify user belongs to this organization
    const { data: membership } = await (supabase as any)
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied to this organization" },
        { status: 403 }
      );
    }

    // Delete the integration
    const success = await deleteCalendarIntegration(organizationId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to delete calendar integration" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete calendar integration error:", error);
    return NextResponse.json(
      { error: "Failed to delete calendar integration" },
      { status: 500 }
    );
  }
}

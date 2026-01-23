import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { markCallAsSpam, markCallAsNotSpam } from "@/lib/spam/spam-detector";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Helper to authorize call access
 * Returns { organizationId, callId } if authorized, or a NextResponse error
 */
async function authorizeCallAccess(
  callId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ organizationId: string } | NextResponse> {
  // Validate UUID format
  if (!UUID_REGEX.test(callId)) {
    return NextResponse.json({ error: "Invalid call ID format" }, { status: 400 });
  }

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's organization
  const { data: membership } = await (supabase as any)
    .from("org_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "No organization found" },
      { status: 403 }
    );
  }

  const organizationId = membership.organization_id as string;

  // Verify the call belongs to this organization
  const { data: call } = await (supabase as any)
    .from("calls")
    .select("id, organization_id")
    .eq("id", callId)
    .eq("organization_id", organizationId)
    .single();

  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  return { organizationId };
}

/**
 * POST /api/v1/calls/:id/spam
 *
 * Mark a call as spam
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: callId } = await params;
    const supabase = await createClient();

    const authResult = await authorizeCallAccess(callId, supabase);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Mark as spam
    const success = await markCallAsSpam(callId, authResult.organizationId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to mark call as spam" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, isSpam: true });
  } catch (error) {
    console.error("Error marking call as spam:", error);
    return NextResponse.json(
      { error: "Failed to update call" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/calls/:id/spam
 *
 * Mark a call as not spam (remove spam flag)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: callId } = await params;
    const supabase = await createClient();

    const authResult = await authorizeCallAccess(callId, supabase);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Mark as not spam
    const success = await markCallAsNotSpam(callId, authResult.organizationId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to update call" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, isSpam: false });
  } catch (error) {
    console.error("Error unmarking call as spam:", error);
    return NextResponse.json(
      { error: "Failed to update call" },
      { status: 500 }
    );
  }
}

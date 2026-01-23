import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  updateTransferRule,
  deleteTransferRule,
} from "@/lib/transfer/transfer-service";

/**
 * PATCH /api/v1/transfer/rules/:id
 *
 * Update a transfer rule
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ruleId } = await params;
    const supabase = await createClient();

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

    // Verify rule exists and belongs to organization
    const { data: existingRule } = await (supabase as any)
      .from("transfer_rules")
      .select("id")
      .eq("id", ruleId)
      .eq("organization_id", organizationId)
      .single();

    if (!existingRule) {
      return NextResponse.json(
        { error: "Transfer rule not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      name,
      triggerKeywords,
      triggerIntent,
      transferToPhone,
      transferToName,
      announcementMessage,
      priority,
      isActive,
    } = body;

    // Update the rule
    const success = await updateTransferRule(ruleId, organizationId, {
      name,
      triggerKeywords,
      triggerIntent,
      transferToPhone,
      transferToName,
      announcementMessage,
      priority,
      isActive,
    });

    if (!success) {
      return NextResponse.json(
        { error: "Failed to update transfer rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update transfer rule error:", error);
    return NextResponse.json(
      { error: "Failed to update transfer rule" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/transfer/rules/:id
 *
 * Delete a transfer rule
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ruleId } = await params;
    const supabase = await createClient();

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

    // Delete the rule
    const success = await deleteTransferRule(ruleId, organizationId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to delete transfer rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete transfer rule error:", error);
    return NextResponse.json(
      { error: "Failed to delete transfer rule" },
      { status: 500 }
    );
  }
}

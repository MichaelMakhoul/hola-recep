import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVapiClient } from "@/lib/vapi";
import { z } from "zod";

// Type for org_members query result
interface Membership {
  organization_id: string;
  role?: string;
}

const updatePhoneNumberSchema = z.object({
  assistantId: z.string().uuid().nullable().optional(),
  friendlyName: z.string().optional(),
});

// GET /api/v1/phone-numbers/[id] - Get a single phone number
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single() as { data: Membership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    const { data: phoneNumber, error } = await (supabase
      .from("phone_numbers") as any)
      .select(`
        *,
        assistants (id, name)
      `)
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .single();

    if (error || !phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    return NextResponse.json(phoneNumber);
  } catch (error) {
    console.error("Error getting phone number:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/phone-numbers/[id] - Update a phone number (assign to assistant)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single() as { data: Membership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get current phone number
    const { data: currentPhoneNumber } = await (supabase
      .from("phone_numbers") as any)
      .select("*")
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .single();

    if (!currentPhoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updatePhoneNumberSchema.parse(body);

    // Get Vapi assistant ID if assigning to an assistant
    let vapiAssistantId: string | undefined;
    if (validatedData.assistantId) {
      const { data: assistant } = await (supabase
        .from("assistants") as any)
        .select("vapi_assistant_id")
        .eq("id", validatedData.assistantId)
        .eq("organization_id", membership.organization_id)
        .single();

      if (assistant?.vapi_assistant_id) {
        vapiAssistantId = assistant.vapi_assistant_id;
      }
    }

    // Update in Vapi
    if (currentPhoneNumber.vapi_phone_number_id) {
      const vapi = getVapiClient();
      await vapi.updatePhoneNumber(currentPhoneNumber.vapi_phone_number_id, {
        assistantId: vapiAssistantId,
        name: validatedData.friendlyName,
      });
    }

    // Update in database
    const updateData: Record<string, unknown> = {};
    if (validatedData.assistantId !== undefined) {
      updateData.assistant_id = validatedData.assistantId;
    }
    if (validatedData.friendlyName !== undefined) {
      updateData.friendly_name = validatedData.friendlyName;
    }

    const { data: phoneNumber, error } = await (supabase
      .from("phone_numbers") as any)
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .select(`
        *,
        assistants (id, name)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(phoneNumber);
  } catch (error) {
    console.error("Error updating phone number:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/phone-numbers/[id] - Release a phone number
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .single() as { data: Membership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    if (!["owner", "admin"].includes(membership.role!)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get phone number
    const { data: phoneNumber } = await (supabase
      .from("phone_numbers") as any)
      .select("vapi_phone_number_id")
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .single();

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    // Delete from Vapi
    if (phoneNumber.vapi_phone_number_id) {
      const vapi = getVapiClient();
      try {
        await vapi.deletePhoneNumber(phoneNumber.vapi_phone_number_id);
      } catch (e) {
        console.error("Failed to delete from Vapi:", e);
      }
    }

    // Delete from database
    const { error } = await (supabase
      .from("phone_numbers") as any)
      .delete()
      .eq("id", id)
      .eq("organization_id", membership.organization_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting phone number:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVapiClient } from "@/lib/vapi";
import { z } from "zod";

// Type for org_members query result
interface Membership {
  organization_id: string;
  role?: string;
}

const buyPhoneNumberSchema = z.object({
  areaCode: z.string().optional(),
  country: z.string().default("US"),
  assistantId: z.string().uuid().optional(),
  friendlyName: z.string().optional(),
});

// GET /api/v1/phone-numbers - List all phone numbers
export async function GET() {
  try {
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

    const { data: phoneNumbers, error } = await (supabase
      .from("phone_numbers") as any)
      .select(`
        *,
        assistants (id, name)
      `)
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(phoneNumbers);
  } catch (error) {
    console.error("Error listing phone numbers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/v1/phone-numbers - Buy a new phone number
export async function POST(request: Request) {
  try {
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

    const body = await request.json();
    const validatedData = buyPhoneNumberSchema.parse(body);

    // Get assistant's Vapi ID if provided
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

    // Buy phone number from Vapi (uses Vapi's free SIP numbers)
    const vapi = getVapiClient();
    const vapiPhoneNumber = await vapi.buyPhoneNumber({
      provider: "vapi",
      numberDesiredAreaCode: validatedData.areaCode,
      assistantId: vapiAssistantId,
      name: validatedData.friendlyName,
    });

    // Save to database
    const { data: phoneNumber, error } = await (supabase
      .from("phone_numbers") as any)
      .insert({
        organization_id: membership.organization_id,
        assistant_id: validatedData.assistantId,
        phone_number: vapiPhoneNumber.number,
        vapi_phone_number_id: vapiPhoneNumber.id,
        friendly_name: validatedData.friendlyName,
        is_active: true,
      })
      .select(`
        *,
        assistants (id, name)
      `)
      .single();

    if (error) {
      // Rollback: delete from Vapi
      try {
        await vapi.deletePhoneNumber(vapiPhoneNumber.id);
      } catch (e) {
        console.error("Failed to rollback Vapi phone number:", e);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(phoneNumber, { status: 201 });
  } catch (error: any) {
    console.error("Error buying phone number:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    // Pass through Vapi error messages (they contain helpful hints)
    if (error?.message) {
      return NextResponse.json(
        { error: error.message },
        { status: error?.statusCode || 500 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

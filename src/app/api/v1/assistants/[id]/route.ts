import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVapiClient } from "@/lib/vapi";
import { z } from "zod";

interface Membership {
  organization_id: string;
  role?: string;
}

interface Assistant {
  id: string;
  vapi_assistant_id: string | null;
  model_provider: string;
  model: string;
  system_prompt: string;
  voice_provider: string;
  voice_id: string;
}

const updateAssistantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  systemPrompt: z.string().min(1).optional(),
  firstMessage: z.string().min(1).optional(),
  voiceId: z.string().optional(),
  voiceProvider: z.string().optional(),
  model: z.string().optional(),
  modelProvider: z.string().optional(),
  knowledgeBase: z.any().optional(),
  tools: z.any().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/assistants/[id] - Get a single assistant
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

    // Get user's organization
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single() as { data: Membership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    const { data: assistant, error } = await (supabase
      .from("assistants") as any)
      .select("*")
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .single();

    if (error || !assistant) {
      return NextResponse.json({ error: "Assistant not found" }, { status: 404 });
    }

    return NextResponse.json(assistant);
  } catch (error) {
    console.error("Error getting assistant:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/assistants/[id] - Update an assistant
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

    // Get user's organization
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single() as { data: Membership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get current assistant
    const { data: currentAssistant } = await (supabase
      .from("assistants") as any)
      .select("*")
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .single() as { data: Assistant | null };

    if (!currentAssistant) {
      return NextResponse.json({ error: "Assistant not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updateAssistantSchema.parse(body);

    // Update in Vapi if there are voice/model changes
    if (currentAssistant.vapi_assistant_id) {
      const vapi = getVapiClient();
      const vapiUpdate: Record<string, unknown> = {};

      if (validatedData.name) {
        vapiUpdate.name = validatedData.name;
      }
      if (validatedData.systemPrompt || validatedData.model || validatedData.modelProvider) {
        vapiUpdate.model = {
          provider: validatedData.modelProvider || currentAssistant.model_provider,
          model: validatedData.model || currentAssistant.model,
          systemPrompt: validatedData.systemPrompt || currentAssistant.system_prompt,
        };
      }
      if (validatedData.voiceId || validatedData.voiceProvider) {
        vapiUpdate.voice = {
          provider: validatedData.voiceProvider || currentAssistant.voice_provider,
          voiceId: validatedData.voiceId || currentAssistant.voice_id,
        };
      }
      if (validatedData.firstMessage) {
        vapiUpdate.firstMessage = validatedData.firstMessage;
      }

      // Always ensure server URL is set for webhooks
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;
      if (appUrl) {
        vapiUpdate.server = {
          url: `${appUrl}/api/webhooks/vapi`,
          ...(webhookSecret && { secret: webhookSecret }),
          timeoutSeconds: 20,
        };
      }

      if (Object.keys(vapiUpdate).length > 0) {
        await vapi.updateAssistant(currentAssistant.vapi_assistant_id, vapiUpdate);
      }
    }

    // Update in database
    const updateData: Record<string, unknown> = {};
    if (validatedData.name) updateData.name = validatedData.name;
    if (validatedData.systemPrompt) updateData.system_prompt = validatedData.systemPrompt;
    if (validatedData.firstMessage) updateData.first_message = validatedData.firstMessage;
    if (validatedData.voiceId) updateData.voice_id = validatedData.voiceId;
    if (validatedData.voiceProvider) updateData.voice_provider = validatedData.voiceProvider;
    if (validatedData.model) updateData.model = validatedData.model;
    if (validatedData.modelProvider) updateData.model_provider = validatedData.modelProvider;
    if (validatedData.knowledgeBase !== undefined) updateData.knowledge_base = validatedData.knowledgeBase;
    if (validatedData.tools !== undefined) updateData.tools = validatedData.tools;
    if (validatedData.isActive !== undefined) updateData.is_active = validatedData.isActive;

    const { data: assistant, error } = await (supabase
      .from("assistants") as any)
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(assistant);
  } catch (error) {
    console.error("Error updating assistant:", error);
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

// DELETE /api/v1/assistants/[id] - Delete an assistant
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

    // Get user's organization and check admin role
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .single() as { data: Membership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    if (!["owner", "admin"].includes(membership.role || "")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get assistant
    const { data: assistant } = await (supabase
      .from("assistants") as any)
      .select("vapi_assistant_id")
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .single() as { data: { vapi_assistant_id: string | null } | null };

    if (!assistant) {
      return NextResponse.json({ error: "Assistant not found" }, { status: 404 });
    }

    // Delete from Vapi
    if (assistant.vapi_assistant_id) {
      const vapi = getVapiClient();
      try {
        await vapi.deleteAssistant(assistant.vapi_assistant_id);
      } catch (e) {
        console.error("Failed to delete from Vapi:", e);
      }
    }

    // Delete from database
    const { error } = await (supabase
      .from("assistants") as any)
      .delete()
      .eq("id", id)
      .eq("organization_id", membership.organization_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting assistant:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

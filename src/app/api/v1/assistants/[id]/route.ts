import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVapiClient, ensureCalendarTools, buildVapiServerConfig } from "@/lib/vapi";
import { buildAnalysisPlan, buildPromptFromConfig, promptConfigSchema } from "@/lib/prompt-builder";
import type { PromptConfig } from "@/lib/prompt-builder/types";
import { getAggregatedKnowledgeBase } from "@/lib/knowledge-base";
import { z } from "zod";

interface Membership {
  organization_id: string;
  role?: string;
}

interface Assistant {
  id: string;
  name: string;
  vapi_assistant_id: string | null;
  model_provider: string;
  model: string;
  system_prompt: string;
  voice_provider: string;
  voice_id: string;
  prompt_config: Record<string, any> | null;
  settings: Record<string, any> | null;
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
  promptConfig: promptConfigSchema.optional(),
  settings: z.record(z.any()).optional(),
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

    // Sync relevant changes to Vapi
    if (currentAssistant.vapi_assistant_id) {
      const vapi = getVapiClient();
      const vapiUpdate: Record<string, unknown> = {};

      if (validatedData.name) {
        vapiUpdate.name = validatedData.name;
      }

      // Only rebuild model when prompt, model, or tool-related fields change
      const needsModelUpdate =
        validatedData.systemPrompt ||
        validatedData.promptConfig !== undefined ||
        validatedData.model ||
        validatedData.modelProvider;

      if (needsModelUpdate) {
        let toolIds: string[];
        try {
          toolIds = await ensureCalendarTools();
        } catch (toolError) {
          console.error("Failed to provision calendar tools in Vapi:", toolError);
          return NextResponse.json(
            { error: "Failed to set up calendar tools. Please try again." },
            { status: 502 }
          );
        }

        const rawPrompt = validatedData.systemPrompt || currentAssistant.system_prompt;
        const promptConfig = validatedData.promptConfig !== undefined
          ? validatedData.promptConfig
          : currentAssistant.prompt_config;

        const aggregatedKB = await getAggregatedKnowledgeBase(
          supabase,
          membership.organization_id
        );

        let vapiSystemPrompt = rawPrompt;
        if (promptConfig) {
          const config = promptConfig as PromptConfig;
          const settings = validatedData.settings || currentAssistant.settings || {};
          const industry = settings.industry || "other";
          vapiSystemPrompt = buildPromptFromConfig(config, {
            businessName: validatedData.name || currentAssistant.name,
            industry,
            knowledgeBase: aggregatedKB || undefined,
          });
        } else if (aggregatedKB) {
          if (rawPrompt.includes("{knowledge_base}")) {
            vapiSystemPrompt = rawPrompt.replace(/{knowledge_base}/g, aggregatedKB);
          } else {
            vapiSystemPrompt = `${rawPrompt}\n\nBusiness Information:\n${aggregatedKB}`;
          }
        }

        vapiUpdate.model = {
          provider: validatedData.modelProvider || currentAssistant.model_provider,
          model: validatedData.model || currentAssistant.model,
          messages: [{ role: "system", content: vapiSystemPrompt }],
          toolIds,
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

      // Attach webhook server config if APP_URL is configured
      const serverConfig = buildVapiServerConfig();
      if (serverConfig) {
        vapiUpdate.server = serverConfig;
      }

      // Build analysis plan from prompt config if provided
      if (validatedData.promptConfig) {
        const analysisPlan = buildAnalysisPlan(validatedData.promptConfig);
        if (analysisPlan) {
          vapiUpdate.analysisPlan = analysisPlan;
        }
      }

      if (Object.keys(vapiUpdate).length > 0) {
        try {
          await vapi.updateAssistant(currentAssistant.vapi_assistant_id, vapiUpdate);
        } catch (vapiError) {
          console.error("Failed to update Vapi assistant:", vapiError);
          return NextResponse.json(
            { error: "Failed to sync changes with voice platform. Please try again." },
            { status: 502 }
          );
        }
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
    if (validatedData.promptConfig !== undefined) updateData.prompt_config = validatedData.promptConfig;
    if (validatedData.settings !== undefined) updateData.settings = validatedData.settings;

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

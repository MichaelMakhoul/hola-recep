import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVapiClient, ensureCalendarTools, buildVapiServerConfig } from "@/lib/vapi";
import { buildAnalysisPlan, buildPromptFromConfig, promptConfigSchema } from "@/lib/prompt-builder";
import { RECORDING_DECLINE_SYSTEM_INSTRUCTION, buildFirstMessageWithDisclosure, resolveRecordingSettings } from "@/lib/templates";
import type { PromptConfig } from "@/lib/prompt-builder/types";
import { getAggregatedKnowledgeBase } from "@/lib/knowledge-base";
import { z } from "zod";

interface Membership {
  organization_id: string;
}

const createAssistantSchema = z.object({
  name: z.string().min(1).max(100),
  systemPrompt: z.string().min(1),
  firstMessage: z.string().min(1),
  voiceId: z.string().default("rachel"),
  voiceProvider: z.string().default("11labs"),
  model: z.string().default("gpt-4o-mini"),
  modelProvider: z.string().default("openai"),
  knowledgeBase: z.any().optional(),
  tools: z.any().optional(),
  promptConfig: promptConfigSchema.optional(),
  settings: z.object({
    recordingEnabled: z.boolean().optional(),
    recordingDisclosure: z.string().optional(),
    maxCallDuration: z.number().optional(),
    spamFilterEnabled: z.boolean().optional(),
    industry: z.string().optional(),
  }).passthrough().optional(),
});

// Map common voice provider names to Vapi's expected values
function normalizeVoiceProvider(provider: string): string {
  const providerMap: Record<string, string> = {
    elevenlabs: "11labs",
    "eleven-labs": "11labs",
  };
  return providerMap[provider.toLowerCase()] || provider;
}

// GET /api/v1/assistants - List all assistants
export async function GET() {
  try {
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

    const { data: assistants, error } = await (supabase
      .from("assistants") as any)
      .select("*")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(assistants);
  } catch (error) {
    console.error("Error listing assistants:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/v1/assistants - Create a new assistant
export async function POST(request: Request) {
  try {
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

    const body = await request.json();
    const validatedData = createAssistantSchema.parse(body);

    // Build server configuration for webhooks
    const serverConfig = buildVapiServerConfig();

    // Build analysis plan from prompt config if available
    const analysisPlan = validatedData.promptConfig
      ? buildAnalysisPlan(validatedData.promptConfig)
      : null;

    // Inject org knowledge base into the system prompt for Vapi
    const aggregatedKB = await getAggregatedKnowledgeBase(
      supabase,
      membership.organization_id
    );

    let vapiSystemPrompt = validatedData.systemPrompt;
    if (validatedData.promptConfig) {
      const config = validatedData.promptConfig as PromptConfig;
      const industry = validatedData.settings?.industry || "other";
      vapiSystemPrompt = buildPromptFromConfig(config, {
        businessName: validatedData.name,
        industry,
        knowledgeBase: aggregatedKB || undefined,
      });
    } else if (aggregatedKB) {
      if (validatedData.systemPrompt.includes("{knowledge_base}")) {
        vapiSystemPrompt = validatedData.systemPrompt.replace(
          /{knowledge_base}/g,
          aggregatedKB
        );
      } else {
        vapiSystemPrompt = `${validatedData.systemPrompt}\n\nBusiness Information:\n${aggregatedKB}`;
      }
    }

    // Ensure standalone calendar tools exist in Vapi and get their IDs (cached after first call)
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

    // Resolve recording settings (default: on with standard disclosure)
    const { recordingEnabled, recordingDisclosure } = resolveRecordingSettings(validatedData.settings);

    // Combine disclosure + greeting for Vapi's firstMessage
    const vapiFirstMessage = buildFirstMessageWithDisclosure(
      validatedData.firstMessage,
      recordingDisclosure,
      validatedData.name
    );

    // When recording is on, instruct the AI to handle opt-out requests
    if (recordingEnabled) {
      vapiSystemPrompt = `${vapiSystemPrompt}\n\n${RECORDING_DECLINE_SYSTEM_INSTRUCTION}`;
    }

    // Create assistant in Vapi — reference calendar tools by ID via model.toolIds
    const vapi = getVapiClient();
    const vapiAssistant = await vapi.createAssistant({
      name: validatedData.name,
      model: {
        provider: validatedData.modelProvider,
        model: validatedData.model,
        messages: [{ role: "system", content: vapiSystemPrompt }],
        toolIds,
      },
      voice: {
        provider: normalizeVoiceProvider(validatedData.voiceProvider),
        voiceId: validatedData.voiceId,
      },
      firstMessage: vapiFirstMessage,
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en",
      },
      server: serverConfig,
      recordingEnabled,
      ...(analysisPlan && { analysisPlan }),
      metadata: {
        organizationId: membership.organization_id,
      },
    });

    // Save assistant to database
    const { data: assistant, error } = await (supabase
      .from("assistants") as any)
      .insert({
        organization_id: membership.organization_id,
        name: validatedData.name,
        vapi_assistant_id: vapiAssistant.id,
        system_prompt: validatedData.systemPrompt,
        first_message: validatedData.firstMessage,
        voice_id: validatedData.voiceId,
        voice_provider: validatedData.voiceProvider,
        model: validatedData.model,
        model_provider: validatedData.modelProvider,
        knowledge_base: validatedData.knowledgeBase,
        tools: validatedData.tools,
        is_active: true,
        prompt_config: validatedData.promptConfig || null,
        settings: validatedData.settings || {},
      })
      .select()
      .single();

    if (error) {
      // Rollback: delete from Vapi if database insert fails
      try {
        await vapi.deleteAssistant(vapiAssistant.id);
      } catch (e) {
        console.error("Failed to rollback Vapi assistant:", e);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(assistant, { status: 201 });
  } catch (error) {
    console.error("Error creating assistant:", error);
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

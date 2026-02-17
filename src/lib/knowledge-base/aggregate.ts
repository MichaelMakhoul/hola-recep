import { getVapiClient, ensureCalendarTools } from "@/lib/vapi";
import { buildPromptFromConfig, buildSchedulingSection } from "@/lib/prompt-builder";
import type { PromptContext } from "@/lib/prompt-builder";
import type { PromptConfig } from "@/lib/prompt-builder/types";
import { getOrgScheduleContext } from "@/lib/supabase/get-org-schedule-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

interface KnowledgeBaseEntry {
  id: string;
  title: string | null;
  source_type: string;
  content: string;
  is_active: boolean;
}

interface AssistantRow {
  id: string;
  vapi_assistant_id: string | null;
  system_prompt: string;
  prompt_config: Record<string, any> | null;
  settings: Record<string, any> | null;
  model_provider: string;
  model: string;
  name: string;
  is_active: boolean;
}

/**
 * Fetches all active org-level KB entries and concatenates them into
 * a single string suitable for injection into a system prompt.
 */
export async function getAggregatedKnowledgeBase(
  supabase: SupabaseAny,
  organizationId: string
): Promise<string> {
  const { data: entries, error } = await (supabase as any)
    .from("knowledge_bases")
    .select("id, title, source_type, content, is_active")
    .eq("organization_id", organizationId)
    .is("assistant_id", null)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch knowledge base entries:", error);
    throw new Error(`Failed to aggregate knowledge base: ${error.message}`);
  }

  if (!entries || entries.length === 0) {
    return "";
  }

  const sections: string[] = [];

  for (const entry of entries as KnowledgeBaseEntry[]) {
    const heading = entry.title || entry.source_type;

    if (entry.source_type === "faq") {
      // Parse FAQ JSON content into Q&A pairs
      try {
        const pairs = JSON.parse(entry.content) as {
          question: string;
          answer: string;
        }[];
        const qaParts = pairs
          .map((p) => `Q: ${p.question}\nA: ${p.answer}`)
          .join("\n\n");
        sections.push(`## ${heading}\n${qaParts}`);
      } catch {
        // If JSON parse fails, use raw content
        sections.push(`## ${heading}\n${entry.content}`);
      }
    } else {
      // website, document, manual — plain text
      sections.push(`## ${heading}\n${entry.content}`);
    }
  }

  return sections.join("\n\n");
}

/**
 * After any KB mutation, rebuild the system prompt for every active assistant
 * in the org and push the updated prompt to Vapi.
 */
export async function resyncOrgAssistants(
  supabase: SupabaseAny,
  organizationId: string
): Promise<void> {
  const aggregatedKB = await getAggregatedKnowledgeBase(supabase, organizationId);

  // Fetch org timezone and business hours for prompt context
  const { timezone: orgTimezone, businessHours: orgBusinessHours } =
    await getOrgScheduleContext(supabase, organizationId, "KB resync");

  const { data: assistants, error } = await (supabase as any)
    .from("assistants")
    .select(
      "id, vapi_assistant_id, system_prompt, prompt_config, settings, model_provider, model, name, is_active"
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    console.error("Failed to fetch assistants for KB resync:", { organizationId, error });
    return;
  }
  if (!assistants || assistants.length === 0) {
    return;
  }

  // Ensure calendar tools (including get_current_datetime) exist and get their IDs
  let toolIds: string[] | undefined;
  try {
    toolIds = await ensureCalendarTools();
  } catch (toolError) {
    console.error("Failed to provision calendar tools during resync:", toolError);
    // Continue without toolIds — prompt update is still valuable
  }

  const vapi = getVapiClient();

  for (const assistant of assistants as AssistantRow[]) {
    if (!assistant.vapi_assistant_id) continue;

    let systemPrompt: string;

    if (assistant.prompt_config) {
      // Guided prompt builder — rebuild with KB + timezone context
      const config = assistant.prompt_config as unknown as PromptConfig;
      const industry = assistant.settings?.industry || "other";
      const promptContext: PromptContext = {
        businessName: assistant.name,
        industry,
        knowledgeBase: aggregatedKB || undefined,
        timezone: orgTimezone,
        businessHours: orgBusinessHours,
      };
      systemPrompt = buildPromptFromConfig(config, promptContext);
    } else {
      // Legacy prompt — replace placeholder or append
      if (assistant.system_prompt.includes("{knowledge_base}")) {
        systemPrompt = assistant.system_prompt.replace(
          /{knowledge_base}/g,
          aggregatedKB || "No additional business information provided yet."
        );
      } else if (aggregatedKB) {
        systemPrompt = `${assistant.system_prompt}\n\nBusiness Information:\n${aggregatedKB}`;
      } else {
        systemPrompt = assistant.system_prompt;
      }
      // For legacy prompts, append scheduling context
      systemPrompt += `\n\n${buildSchedulingSection(orgTimezone, orgBusinessHours)}`;
    }

    try {
      await vapi.updateAssistant(assistant.vapi_assistant_id, {
        model: {
          provider: assistant.model_provider,
          model: assistant.model,
          messages: [{ role: "system", content: systemPrompt }],
          ...(toolIds && { toolIds }),
        },
      });
    } catch (err) {
      console.error(
        `Failed to resync assistant ${assistant.id} to Vapi:`,
        err
      );
    }
  }
}

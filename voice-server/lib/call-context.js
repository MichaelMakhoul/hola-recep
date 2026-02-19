const { getSupabase } = require("./supabase");

/**
 * Load all context needed to handle a call on a self-hosted phone number.
 *
 * @param {string} calledNumber - E.164 phone number (e.g. "+61299999999")
 * @returns {Promise<object|null>} Combined context or null if not found/not active
 */
async function loadCallContext(calledNumber) {
  const supabase = getSupabase();

  // 1. Look up the phone number — must be active and self_hosted
  const { data: phone, error: phoneError } = await supabase
    .from("phone_numbers")
    .select("id, organization_id, assistant_id")
    .eq("phone_number", calledNumber)
    .eq("voice_provider", "self_hosted")
    .eq("is_active", true)
    .single();

  if (phoneError || !phone) {
    if (phoneError && phoneError.code !== "PGRST116") {
      console.error("[CallContext] Phone lookup error:", phoneError);
    }
    return null;
  }

  if (!phone.assistant_id) {
    console.error("[CallContext] Phone number has no assistant assigned:", calledNumber);
    return null;
  }

  // 2. Load assistant
  const { data: assistant, error: assistantError } = await supabase
    .from("assistants")
    .select("id, name, system_prompt, prompt_config, settings, first_message, is_active")
    .eq("id", phone.assistant_id)
    .single();

  if (assistantError || !assistant) {
    console.error("[CallContext] Assistant lookup error:", assistantError);
    return null;
  }

  if (!assistant.is_active) {
    console.warn("[CallContext] Assistant is inactive:", assistant.id);
    return null;
  }

  // 3. Load organization
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, industry, timezone, business_hours, default_appointment_duration")
    .eq("id", phone.organization_id)
    .single();

  if (orgError || !org) {
    console.error("[CallContext] Organization lookup error:", orgError);
    return null;
  }

  // 4. Load knowledge base (org-level, active entries)
  const { data: kbEntries, error: kbError } = await supabase
    .from("knowledge_bases")
    .select("id, title, source_type, content, is_active")
    .eq("organization_id", phone.organization_id)
    .is("assistant_id", null)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (kbError) {
    console.error("[CallContext] Knowledge base lookup error:", kbError);
    // Non-fatal — proceed without KB
  }

  // Aggregate KB content (mirrors src/lib/knowledge-base/aggregate.ts)
  let knowledgeBase = "";
  if (kbEntries && kbEntries.length > 0) {
    const sections = [];
    for (const entry of kbEntries) {
      const heading = entry.title || entry.source_type;
      if (entry.source_type === "faq") {
        try {
          const pairs = JSON.parse(entry.content);
          const qaParts = pairs
            .map((p) => `Q: ${p.question}\nA: ${p.answer}`)
            .join("\n\n");
          sections.push(`## ${heading}\n${qaParts}`);
        } catch (parseErr) {
          console.warn("[CallContext] FAQ entry has malformed JSON — using raw content:", {
            entryId: entry.id,
            error: parseErr.message,
          });
          sections.push(`## ${heading}\n${entry.content}`);
        }
      } else {
        sections.push(`## ${heading}\n${entry.content}`);
      }
    }
    knowledgeBase = sections.join("\n\n");
  }

  return {
    phoneNumberId: phone.id,
    organizationId: phone.organization_id,
    assistantId: assistant.id,
    assistant: {
      name: assistant.name,
      systemPrompt: assistant.system_prompt,
      promptConfig: assistant.prompt_config,
      settings: assistant.settings,
      firstMessage: assistant.first_message,
    },
    organization: {
      name: org.name,
      industry: org.industry || "other",
      timezone: org.timezone || undefined,
      businessHours: org.business_hours || undefined,
      defaultAppointmentDuration: org.default_appointment_duration ?? undefined,
    },
    knowledgeBase,
  };
}

module.exports = { loadCallContext };

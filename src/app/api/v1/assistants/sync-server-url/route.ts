import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVapiClient, buildVapiServerConfig } from "@/lib/vapi";
import { withRateLimit } from "@/lib/security/rate-limiter";

/**
 * POST /api/v1/assistants/sync-server-url
 * Re-syncs the Vapi server URL for all assistants in the user's org.
 * Use this after deploying to production if assistants were created locally.
 */
export async function POST(request: NextRequest) {
  try {
    const { allowed, headers } = withRateLimit(request, "/api/v1/assistants/sync-server-url", "expensive");
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await (supabase as any)
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (membershipError && membershipError.code !== "PGRST116") {
      console.error("Failed to look up org membership:", membershipError);
      return NextResponse.json({ error: "Failed to look up organization" }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    const orgId = membership.organization_id;

    const serverConfig = buildVapiServerConfig();
    if (!serverConfig) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_APP_URL is not configured" },
        { status: 500 }
      );
    }

    const { data: assistants, error } = await (supabase as any)
      .from("assistants")
      .select("id, name, vapi_assistant_id")
      .eq("organization_id", orgId)
      .not("vapi_assistant_id", "is", null);

    if (error || !assistants) {
      console.error("Failed to fetch assistants:", error);
      return NextResponse.json(
        { error: "Failed to fetch assistants" },
        { status: 500 }
      );
    }

    const vapi = getVapiClient();
    const results: { id: string; name: string; success: boolean; error?: string }[] = [];

    for (const assistant of assistants) {
      try {
        await vapi.updateAssistant(assistant.vapi_assistant_id, {
          server: serverConfig,
        });
        results.push({ id: assistant.id, name: assistant.name, success: true });
      } catch (err) {
        results.push({
          id: assistant.id,
          name: assistant.name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const updated = results.filter((r) => r.success).length;

    return NextResponse.json({
      serverUrl: serverConfig.url,
      updated,
      failed: results.length - updated,
      results,
    });
  } catch (error) {
    console.error("Sync server URL failed:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while syncing server URLs" },
      { status: 500 }
    );
  }
}

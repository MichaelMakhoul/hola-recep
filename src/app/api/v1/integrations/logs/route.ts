import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRateLimit } from "@/lib/security/rate-limiter";
import type { OrgMembership } from "@/lib/integrations/types";

// GET /api/v1/integrations/logs — all logs across all integrations for the org
export async function GET(request: Request) {
  try {
    const { allowed, headers } = withRateLimit(request, "/api/v1/integrations/logs", "standard");
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: membership } = (await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single()) as { data: OrgMembership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") || "0", 10);
    const limit = Math.min(Number.isNaN(rawLimit) ? 50 : Math.max(1, rawLimit), 100);
    const offset = Number.isNaN(rawOffset) ? 0 : Math.max(0, rawOffset);

    // Get all integration IDs for this org
    const { data: integrations } = await (supabase.from("integrations") as any)
      .select("id, name")
      .eq("organization_id", membership.organization_id);

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ logs: [], total: 0, limit, offset });
    }

    const integrationIds = integrations.map((i: { id: string }) => i.id);
    const integrationMap = Object.fromEntries(
      integrations.map((i: { id: string; name: string }) => [i.id, i.name])
    );

    const { data: logs, error, count } = await (supabase.from("integration_logs") as any)
      .select("id, integration_id, event_type, response_status, success, attempted_at, retry_count", {
        count: "exact",
      })
      .in("integration_id", integrationIds)
      .order("attempted_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Failed to fetch integration logs:", error);
      return NextResponse.json({ error: "Failed to load logs" }, { status: 500 });
    }

    // Attach integration name
    const enriched = (logs || []).map((log: Record<string, unknown>) => ({
      ...log,
      integration_name: integrationMap[log.integration_id as string] || "Unknown",
    }));

    return NextResponse.json({
      logs: enriched,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching all integration logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

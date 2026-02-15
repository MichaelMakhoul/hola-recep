import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRateLimit } from "@/lib/security/rate-limiter";
import { isValidUUID } from "@/lib/security/validation";

interface Membership {
  organization_id: string;
}

// GET /api/v1/integrations/[id]/logs
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid integration ID" }, { status: 400 });
    }

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
      .single()) as { data: Membership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Verify integration belongs to this org
    const { data: integration, error: intError } = await (supabase.from("integrations") as any)
      .select("id")
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .single();

    if (intError || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    // Parse pagination from query params
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const { data: logs, error, count } = await (supabase.from("integration_logs") as any)
      .select("id, event_type, response_status, success, attempted_at, retry_count", {
        count: "exact",
      })
      .eq("integration_id", id)
      .order("attempted_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      logs: logs || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching integration logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

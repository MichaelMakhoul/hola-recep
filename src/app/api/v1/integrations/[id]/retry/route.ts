import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRateLimit } from "@/lib/security/rate-limiter";
import { isValidUUID } from "@/lib/security/validation";
import { retryFailedWebhook } from "@/lib/integrations/retry";

interface Membership {
  organization_id: string;
  role?: string;
}

// POST /api/v1/integrations/[id]/retry — retry a failed log entry
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Here `id` is the integration ID; the logId comes from the body
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid integration ID" }, { status: 400 });
    }

    const { allowed, headers } = withRateLimit(request, "/api/v1/integrations/retry", "testCall");
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
      .select("organization_id, role")
      .eq("user_id", user.id)
      .single()) as { data: Membership | null };

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    if (!["owner", "admin"].includes(membership.role || "")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
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

    const body = await request.json();
    const logId = body.logId;
    if (!logId || !isValidUUID(logId)) {
      return NextResponse.json({ error: "Invalid log ID" }, { status: 400 });
    }

    const result = await retryFailedWebhook(logId, id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error retrying webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

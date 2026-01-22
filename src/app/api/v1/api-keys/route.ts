import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/utils";
import { z } from "zod";
import crypto from "crypto";

interface Membership {
  organization_id: string;
  role?: string;
}

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).default(["read", "write"]),
  expiresAt: z.string().datetime().optional(),
});

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// GET /api/v1/api-keys - List all API keys
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

    const { data: apiKeys, error } = await (supabase
      .from("api_keys") as any)
      .select("id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(apiKeys);
  } catch (error) {
    console.error("Error listing API keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/v1/api-keys - Create a new API key
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

    if (!["owner", "admin"].includes(membership.role || "")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createApiKeySchema.parse(body);

    // Generate API key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 10);

    // Save to database
    const { data: createdKey, error } = await (supabase
      .from("api_keys") as any)
      .insert({
        organization_id: membership.organization_id,
        name: validatedData.name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: validatedData.scopes,
        expires_at: validatedData.expiresAt,
        is_active: true,
      })
      .select("id, name, key_prefix, scopes, expires_at, is_active, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return the full key only once (on creation)
    return NextResponse.json({
      ...createdKey,
      key: apiKey, // Only returned on creation!
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating API key:", error);
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

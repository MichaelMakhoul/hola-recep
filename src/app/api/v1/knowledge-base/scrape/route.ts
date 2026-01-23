import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeWebsite, generateKnowledgeBase } from "@/lib/scraper/website-scraper";
import { isUrlAllowed, isValidUUID } from "@/lib/security/validation";
import { withRateLimit } from "@/lib/security/rate-limiter";

/**
 * POST /api/v1/knowledge-base/scrape
 *
 * Scrapes a website and generates knowledge base content
 *
 * Body:
 * - url: string (required) - The website URL to scrape
 * - assistantId: string (optional) - Associate with an assistant
 * - maxPages: number (optional) - Maximum pages to scrape (default: 20)
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit - expensive operation
    const { allowed, headers } = withRateLimit(request, "/api/v1/knowledge-base/scrape", "expensive");
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers }
      );
    }

    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's organization
    const { data: membership, error: membershipError } = await (supabase as any)
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    const organizationId = membership.organization_id as string;

    // Parse request body
    const body = await request.json();
    const { url, assistantId, maxPages = 20 } = body;

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL provided" },
        { status: 400 }
      );
    }

    // SSRF Protection: Prevent scraping internal/private networks
    if (!isUrlAllowed(url)) {
      return NextResponse.json(
        { error: "URL not allowed - internal or private addresses are blocked" },
        { status: 400 }
      );
    }

    // Validate assistantId format if provided
    if (assistantId && !isValidUUID(assistantId)) {
      return NextResponse.json(
        { error: "Invalid assistant ID format" },
        { status: 400 }
      );
    }

    // If assistantId provided, verify it belongs to the organization
    if (assistantId) {
      const { data: assistant, error: assistantError } = await (supabase as any)
        .from("assistants")
        .select("id")
        .eq("id", assistantId)
        .eq("organization_id", organizationId)
        .single();

      if (assistantError || !assistant) {
        return NextResponse.json(
          { error: "Assistant not found or access denied" },
          { status: 404 }
        );
      }
    }

    // Scrape the website
    const scrapedData = await scrapeWebsite(url, {
      maxPages: Math.min(maxPages, 50), // Cap at 50 pages
      maxDepth: 2,
    });

    // Generate knowledge base content
    const knowledgeBaseContent = generateKnowledgeBase(scrapedData);

    // If assistantId provided, save to knowledge_bases table
    if (assistantId) {
      const { error: insertError } = await (supabase as any)
        .from("knowledge_bases")
        .insert({
          organization_id: organizationId,
          assistant_id: assistantId,
          source_type: "website",
          source_url: url,
          content: knowledgeBaseContent,
          metadata: {
            totalPages: scrapedData.totalPages,
            scrapedAt: scrapedData.scrapedAt,
            businessInfo: scrapedData.businessInfo,
          },
          is_active: true,
        });

      if (insertError) {
        console.error("Failed to save knowledge base:", insertError);
        // Don't fail the request, still return the scraped content
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        url: scrapedData.baseUrl,
        totalPages: scrapedData.totalPages,
        businessInfo: scrapedData.businessInfo,
        content: knowledgeBaseContent,
        contentLength: knowledgeBaseContent.length,
        pages: scrapedData.pages.map((p) => ({
          url: p.url,
          title: p.title,
          contentLength: p.content.length,
        })),
      },
    });
  } catch (error: any) {
    console.error("Scrape error:", error);
    // Don't expose internal error details to client
    return NextResponse.json(
      { error: "Failed to scrape website" },
      { status: 500 }
    );
  }
}

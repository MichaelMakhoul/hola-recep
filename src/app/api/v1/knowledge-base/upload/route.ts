import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resyncOrgAssistants } from "@/lib/knowledge-base";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_LENGTH = 50_000;

// POST /api/v1/knowledge-base/upload — upload a PDF or DOCX file
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await (supabase as any)
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const fileType = file.type;
    const fileName = file.name;
    let extractedText = "";

    if (
      fileType === "application/pdf" ||
      fileName.toLowerCase().endsWith(".pdf")
    ) {
      const { PDFParse } = await import("pdf-parse");
      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      extractedText = textResult.text;
      await parser.destroy();
    } else if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.toLowerCase().endsWith(".docx")
    ) {
      const mammoth = await import("mammoth");
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or DOCX file." },
        { status: 400 }
      );
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from file." },
        { status: 400 }
      );
    }

    // Truncate to max length
    if (extractedText.length > MAX_TEXT_LENGTH) {
      extractedText = extractedText.slice(0, MAX_TEXT_LENGTH);
    }

    const entryTitle = title || fileName.replace(/\.[^.]+$/, "");

    const { data: entry, error } = await (supabase as any)
      .from("knowledge_bases")
      .insert({
        organization_id: membership.organization_id,
        assistant_id: null,
        title: entryTitle,
        source_type: "document",
        content: extractedText,
        metadata: {
          fileName,
          fileSize: file.size,
          fileType,
        },
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await resyncOrgAssistants(supabase, membership.organization_id).catch(
      (err) => console.error("Failed to resync assistants:", err)
    );

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 }
    );
  }
}

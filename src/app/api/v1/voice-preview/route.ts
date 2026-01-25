import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRateLimit } from "@/lib/security/rate-limiter";
import { isValidVoiceId } from "@/lib/security/validation";

// Maximum text length to prevent abuse (ElevenLabs charges per character)
const MAX_TEXT_LENGTH = 500;

// POST /api/v1/voice-preview - Generate voice preview using ElevenLabs
export async function POST(request: Request) {
  try {
    // Rate limit - voice preview is an expensive operation
    const { allowed, headers } = withRateLimit(request, "/api/v1/voice-preview", "expensive");
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers }
      );
    }

    // Authentication check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { voiceId, text } = body;

    if (!voiceId || !text) {
      return NextResponse.json(
        { error: "voiceId and text are required" },
        { status: 400 }
      );
    }

    // Validate voice ID format to prevent injection
    if (!isValidVoiceId(voiceId)) {
      return NextResponse.json(
        { error: "Invalid voice ID format" },
        { status: 400 }
      );
    }

    // Validate text length to prevent API abuse
    if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text must be a string with maximum ${MAX_TEXT_LENGTH} characters` },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Voice preview is not configured. Please add ELEVENLABS_API_KEY to your environment." },
        { status: 503 }
      );
    }

    // Call ElevenLabs Text-to-Speech API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate voice preview" },
        { status: response.status }
      );
    }

    // Stream the audio response back to the client
    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Error generating voice preview:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

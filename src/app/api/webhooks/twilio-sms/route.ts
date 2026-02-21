import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Twilio from "twilio";

const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "cancel", "end", "quit"];

/**
 * POST /api/webhooks/twilio-sms
 *
 * Receives inbound SMS from Twilio. Twilio auto-handles STOP at carrier level,
 * but we record opt-outs locally for pre-send checks and audit.
 */
export async function POST(request: Request) {
  // 1. Validate Twilio signature
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  if (!twilioAuthToken) {
    console.error("[TwilioSMS] TWILIO_AUTH_TOKEN not configured — cannot validate inbound SMS");
    return new Response("<Response></Response>", {
      status: 500,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const signature = request.headers.get("X-Twilio-Signature") || "";
  const url =
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-sms`
      : request.url;

  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });

  const isValid = Twilio.validateRequest(
    twilioAuthToken,
    signature,
    url,
    params
  );

  if (!isValid) {
    console.warn("[TwilioSMS] Invalid Twilio signature — rejecting request");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const body = (params.Body || "").trim().toLowerCase();
  const from = params.From || "";
  const to = params.To || "";

  // 2. Only process opt-out keywords
  if (!OPT_OUT_KEYWORDS.includes(body)) {
    return new Response("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // 3. Look up org by the `To` number (the org's Twilio number)
  const supabase = createAdminClient();
  const { data: phoneRecord } = await (supabase as any)
    .from("phone_numbers")
    .select("organization_id")
    .eq("phone_number", to)
    .eq("is_active", true)
    .maybeSingle();

  if (!phoneRecord) {
    console.warn("[TwilioSMS] No org found for number:", to);
    return new Response("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // 4. Upsert opt-out record
  const { error } = await (supabase as any)
    .from("caller_sms_optouts")
    .upsert(
      {
        phone_number: from,
        organization_id: phoneRecord.organization_id,
        opted_out_at: new Date().toISOString(),
        source: "twilio_stop",
      },
      { onConflict: "phone_number,organization_id" }
    );

  if (error) {
    console.error("[TwilioSMS] Failed to record opt-out — Twilio will retry:", { from, orgId: phoneRecord.organization_id, error });
    return new Response("<Response></Response>", {
      status: 500,
      headers: { "Content-Type": "text/xml" },
    });
  }

  console.log("[TwilioSMS] Recorded opt-out:", { from, orgId: phoneRecord.organization_id });
  return new Response("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

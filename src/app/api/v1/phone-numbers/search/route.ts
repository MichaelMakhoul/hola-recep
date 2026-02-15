import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVapiClient } from "@/lib/vapi";
import { getCountryConfig } from "@/lib/country-config";

interface Membership {
  organization_id: string;
}

// POST /api/v1/phone-numbers/search - Search available phone numbers
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up org's country
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single() as { data: Membership | null };

    let countryCode = "US";
    if (membership) {
      const { data: org } = await (supabase as any)
        .from("organizations")
        .select("country")
        .eq("id", membership.organization_id)
        .single();
      countryCode = org?.country || "US";
    }

    const config = getCountryConfig(countryCode);
    const body = await request.json();
    const { areaCode, limit = 10 } = body;

    if (config.phoneProvider === "twilio") {
      // Real Twilio search for AU (and future Twilio countries)
      const { searchAvailableNumbers } = await import("@/lib/twilio/client");
      const numbers = await searchAvailableNumbers(config.twilioCountryCode, areaCode, limit);
      return NextResponse.json(
        numbers.map((n) => ({
          number: n.number,
          locality: n.locality,
          region: n.region,
          areaCode: areaCode || undefined,
        }))
      );
    }

    // Vapi mock search for US
    const vapi = getVapiClient();
    const availableNumbers = await vapi.searchPhoneNumbers({
      areaCode,
      country: countryCode,
      limit,
    });

    return NextResponse.json(availableNumbers);
  } catch (error) {
    console.error("Error searching phone numbers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

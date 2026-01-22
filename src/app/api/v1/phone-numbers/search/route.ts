import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVapiClient } from "@/lib/vapi";

// POST /api/v1/phone-numbers/search - Search available phone numbers
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { areaCode, country = "US", limit = 10 } = body;

    const vapi = getVapiClient();
    const availableNumbers = await vapi.searchPhoneNumbers({
      areaCode,
      country,
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

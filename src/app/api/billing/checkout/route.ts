import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getStripeClient,
  createCustomer,
  createCheckoutSession,
  PLANS,
  PlanType,
} from "@/lib/stripe";

interface Organization {
  id: string;
  name: string;
  stripe_customer_id: string | null;
}

interface Membership {
  organization_id: string;
  role: string;
  organizations: Organization;
}

// POST /api/billing/checkout - Create a checkout session
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select(`
        organization_id,
        role,
        organizations (id, name, stripe_customer_id)
      `)
      .eq("user_id", user.id)
      .single() as { data: Membership | null };

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const organization = membership.organizations;

    const body = await request.json();
    const { planType } = body as { planType: PlanType };

    const plan = PLANS[planType];
    if (!plan || !plan.stripePriceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get or create Stripe customer
    let customerId = organization.stripe_customer_id;
    if (!customerId) {
      const customer = await createCustomer(
        user.email!,
        organization.name,
        organization.id
      );
      customerId = customer.id;

      // Save customer ID to organization
      await (supabase
        .from("organizations") as any)
        .update({ stripe_customer_id: customerId })
        .eq("id", organization.id);
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await createCheckoutSession(
      customerId,
      plan.stripePriceId,
      `${baseUrl}/billing?success=true`,
      `${baseUrl}/billing?canceled=true`,
      { organizationId: organization.id, planType }
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

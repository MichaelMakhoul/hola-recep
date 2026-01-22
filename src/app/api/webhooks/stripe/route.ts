import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { constructWebhookEvent, PLANS, PlanType } from "@/lib/stripe";
import type Stripe from "stripe";

// POST /api/webhooks/stripe - Handle Stripe webhook events
export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(payload, signature);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const supabase = createAdminClient();

    console.log("Stripe webhook received:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // Get organization by Stripe customer ID
        const { data: org } = await (supabase
          .from("organizations") as any)
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (!org) {
          console.error("Organization not found for customer:", customerId);
          break;
        }

        // Get subscription details
        const stripe = (await import("stripe")).default;
        const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!);
        const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id;

        // Find plan type from price ID
        let planType: PlanType = "free";
        for (const [key, plan] of Object.entries(PLANS)) {
          if (plan.stripePriceId === priceId) {
            planType = key as PlanType;
            break;
          }
        }

        // Create or update subscription record
        await (supabase.from("subscriptions") as any).upsert({
          organization_id: org.id,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          plan_type: planType,
          status: subscription.status,
          included_minutes: PLANS[planType].minutes,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        }, {
          onConflict: "organization_id",
        });

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id;

        // Find plan type
        let planType: PlanType = "free";
        for (const [key, plan] of Object.entries(PLANS)) {
          if (plan.stripePriceId === priceId) {
            planType = key as PlanType;
            break;
          }
        }

        // Update subscription record
        await (supabase
          .from("subscriptions") as any)
          .update({
            stripe_price_id: priceId,
            plan_type: planType,
            status: subscription.status,
            included_minutes: PLANS[planType].minutes,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          })
          .eq("stripe_subscription_id", subscription.id);

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        // Update subscription status to canceled
        await (supabase
          .from("subscriptions") as any)
          .update({
            status: "canceled",
          })
          .eq("stripe_subscription_id", subscription.id);

        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          // Reset usage records at the start of new billing period
          const { data: sub } = await (supabase
            .from("subscriptions") as any)
            .select("organization_id")
            .eq("stripe_subscription_id", subscriptionId)
            .single();

          if (sub) {
            // Mark previous usage records as reported
            await (supabase
              .from("usage_records") as any)
              .update({ reported_to_stripe: true })
              .eq("organization_id", sub.organization_id)
              .eq("reported_to_stripe", false);
          }
        }

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          // Update subscription status to past_due
          await (supabase
            .from("subscriptions") as any)
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);
        }

        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

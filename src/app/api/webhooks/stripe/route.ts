import { NextResponse } from "next/server";
import { constructWebhookEvent, PLANS, PlanType } from "@/lib/stripe";
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionCanceled,
  resetMonthlyUsage,
} from "@/lib/stripe/billing-service";
import { createAdminClient } from "@/lib/supabase/admin";
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

    console.log("Stripe webhook received:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = session.subscription as string;

        if (subscriptionId) {
          // Retrieve the full subscription to get metadata
          const stripe = (await import("stripe")).default;
          const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: "2025-02-24.acacia",
          });
          const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);

          // Use billing service to handle subscription creation
          await handleSubscriptionCreated(subscription);
        }
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(subscription);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        // Reset call usage at the start of new billing period
        if (subscriptionId && invoice.billing_reason === "subscription_cycle") {
          const supabase = createAdminClient();
          const { data: sub } = await (supabase as any)
            .from("subscriptions")
            .select("organization_id")
            .eq("stripe_subscription_id", subscriptionId)
            .single();

          if (sub) {
            await resetMonthlyUsage(sub.organization_id);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const supabase = createAdminClient();
          // Update subscription status to past_due
          await (supabase as any)
            .from("subscriptions")
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

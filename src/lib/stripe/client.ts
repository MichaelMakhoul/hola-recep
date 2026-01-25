import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return stripeClient;
}

// New call-based pricing model (SMB-first)
export const PLANS = {
  starter: {
    name: "Starter",
    price: 4900, // $49/month
    callsLimit: 100, // calls per month, not minutes
    assistants: 1,
    phoneNumbers: 1,
    calendarIntegration: false,
    callTransfer: false,
    prioritySupport: false,
    trialDays: 14,
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
    features: [
      "100 calls/month",
      "1 AI assistant",
      "1 phone number",
      "Call transcripts",
      "Email notifications",
    ],
  },
  professional: {
    name: "Professional",
    price: 9900, // $99/month
    callsLimit: 250,
    assistants: 3,
    phoneNumbers: 2,
    calendarIntegration: true,
    callTransfer: true,
    prioritySupport: true,
    trialDays: 14,
    stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
    features: [
      "250 calls/month",
      "3 AI assistants",
      "2 phone numbers",
      "Calendar integration",
      "Call transfers",
      "Priority support",
    ],
  },
  growth: {
    name: "Growth",
    price: 19900, // $199/month
    callsLimit: -1, // unlimited
    assistants: 10,
    phoneNumbers: 5,
    calendarIntegration: true,
    callTransfer: true,
    prioritySupport: true,
    humanEscalation: true,
    advancedAnalytics: true,
    customVoice: true,
    trialDays: 14,
    stripePriceId: process.env.STRIPE_GROWTH_PRICE_ID,
    features: [
      "Unlimited calls",
      "10 AI assistants",
      "5 phone numbers",
      "Human escalation option",
      "Advanced analytics",
      "Custom voice selection",
      "White-glove onboarding",
    ],
  },
  // Keep agency tiers for Phase 2
  agency_starter: {
    name: "Agency Starter",
    price: 19900,
    callsLimit: 0, // pay per call
    assistants: -1,
    phoneNumbers: -1,
    subaccounts: 10,
    ratePerCall: 50, // cents per call
    stripePriceId: process.env.STRIPE_AGENCY_STARTER_PRICE_ID,
    features: [
      "Up to 10 client accounts",
      "Unlimited assistants",
      "White-label options",
      "$0.50/call",
    ],
  },
  agency_growth: {
    name: "Agency Growth",
    price: 49900,
    callsLimit: 0,
    assistants: -1,
    phoneNumbers: -1,
    subaccounts: 50,
    ratePerCall: 35,
    stripePriceId: process.env.STRIPE_AGENCY_GROWTH_PRICE_ID,
    features: [
      "Up to 50 client accounts",
      "Unlimited assistants",
      "Full white-label",
      "$0.35/call",
    ],
  },
  agency_scale: {
    name: "Agency Scale",
    price: 99900,
    callsLimit: 0,
    assistants: -1,
    phoneNumbers: -1,
    subaccounts: -1, // unlimited
    ratePerCall: 25,
    stripePriceId: process.env.STRIPE_AGENCY_SCALE_PRICE_ID,
    features: [
      "Unlimited client accounts",
      "Custom integrations",
      "Dedicated support",
      "$0.25/call",
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;

// No more per-minute overage - upgrade prompts instead
export const CALL_THRESHOLD_WARNING = 0.8; // Warn at 80% usage

export async function createCustomer(
  email: string,
  name: string,
  organizationId: string
): Promise<Stripe.Customer> {
  const stripe = getStripeClient();
  return stripe.customers.create({
    email,
    name,
    metadata: {
      organizationId,
    },
  });
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripeClient();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.retrieve(subscriptionId);
}

export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });
}

export async function reportUsage(
  subscriptionItemId: string,
  quantity: number,
  timestamp?: number
): Promise<Stripe.UsageRecord> {
  const stripe = getStripeClient();
  return stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
    quantity,
    timestamp: timestamp || Math.floor(Date.now() / 1000),
    action: "increment",
  });
}

export function constructWebhookEvent(
  payload: string,
  signature: string
): Stripe.Event {
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}

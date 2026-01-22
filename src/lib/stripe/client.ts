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

// Plan configurations
export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    minutes: 50,
    assistants: 1,
    phoneNumbers: 0,
    stripePriceId: null,
  },
  starter: {
    name: "Starter",
    price: 4900, // cents
    minutes: 500,
    assistants: 3,
    phoneNumbers: 1,
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
  },
  professional: {
    name: "Professional",
    price: 14900,
    minutes: 2000,
    assistants: 10,
    phoneNumbers: 5,
    stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
  },
  business: {
    name: "Business",
    price: 34900,
    minutes: 5000,
    assistants: -1, // unlimited
    phoneNumbers: 20,
    stripePriceId: process.env.STRIPE_BUSINESS_PRICE_ID,
  },
  agency_starter: {
    name: "Agency Starter",
    price: 19900,
    minutes: 0, // pay per minute
    assistants: -1,
    phoneNumbers: -1,
    subaccounts: 10,
    ratePerMinute: 12, // cents
    stripePriceId: process.env.STRIPE_AGENCY_STARTER_PRICE_ID,
  },
  agency_growth: {
    name: "Agency Growth",
    price: 49900,
    minutes: 0,
    assistants: -1,
    phoneNumbers: -1,
    subaccounts: 50,
    ratePerMinute: 9,
    stripePriceId: process.env.STRIPE_AGENCY_GROWTH_PRICE_ID,
  },
  agency_scale: {
    name: "Agency Scale",
    price: 99900,
    minutes: 0,
    assistants: -1,
    phoneNumbers: -1,
    subaccounts: -1,
    ratePerMinute: 7,
    stripePriceId: process.env.STRIPE_AGENCY_SCALE_PRICE_ID,
  },
} as const;

export type PlanType = keyof typeof PLANS;

export const OVERAGE_RATE_CENTS = 15; // $0.15 per minute for SMB plans

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

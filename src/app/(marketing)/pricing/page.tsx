import { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing | Hola Recep",
  description: "Simple, transparent pricing for AI-powered phone receptionists",
};

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    description: "Perfect for getting started",
    features: [
      "100 calls/month",
      "1 AI assistant",
      "1 phone number",
      "Call transcripts",
      "Email notifications",
    ],
    highlighted: false,
  },
  {
    id: "professional",
    name: "Professional",
    price: 99,
    description: "For growing businesses",
    features: [
      "250 calls/month",
      "3 AI assistants",
      "2 phone numbers",
      "Calendar integration",
      "Call transfers",
      "Priority support",
    ],
    highlighted: true,
  },
  {
    id: "growth",
    name: "Growth",
    price: 199,
    description: "For high-volume businesses",
    features: [
      "Unlimited calls",
      "10 AI assistants",
      "5 phone numbers",
      "Human escalation",
      "Advanced analytics",
      "Custom voice selection",
      "White-glove onboarding",
    ],
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-20">
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start with a 14-day free trial. No credit card required.
            Cancel anytime.
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid gap-8 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border bg-card p-8 shadow-sm ${
                plan.highlighted
                  ? "border-primary ring-2 ring-primary"
                  : "border-border"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>

                <Link
                  href="/signup"
                  className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium ${
                    plan.highlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-background hover:bg-accent"
                  }`}
                >
                  Start Free Trial
                </Link>

                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold">What counts as a call?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Each inbound call answered by your AI receptionist counts as one call,
                regardless of duration. Spam calls detected by our system are not counted.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Can I change plans later?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Yes, you can upgrade or downgrade at any time. Changes take effect
                at the start of your next billing cycle.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">What happens when I hit my call limit?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                We provide a 10% grace buffer. After that, you&apos;ll be prompted to
                upgrade. Your assistant will continue handling calls during the buffer period.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Is there a contract?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No long-term contracts. All plans are month-to-month and you can cancel anytime.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get Started Free
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            14-day free trial. No credit card required.
          </p>
        </div>
      </div>
    </div>
  );
}

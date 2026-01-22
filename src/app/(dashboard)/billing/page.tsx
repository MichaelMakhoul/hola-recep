"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "Get started with basic features",
    features: ["50 minutes/month", "1 AI assistant", "Test calls only", "Basic analytics"],
    highlighted: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: 4900,
    description: "Perfect for small businesses",
    features: ["500 minutes/month", "3 AI assistants", "1 phone number", "Call transcripts", "Email support"],
    highlighted: false,
  },
  {
    id: "professional",
    name: "Professional",
    price: 14900,
    description: "For growing businesses",
    features: [
      "2,000 minutes/month",
      "10 AI assistants",
      "5 phone numbers",
      "Call recordings",
      "Priority support",
      "API access",
    ],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    price: 34900,
    description: "For large teams",
    features: [
      "5,000 minutes/month",
      "Unlimited assistants",
      "20 phone numbers",
      "Advanced analytics",
      "Dedicated support",
      "Custom integrations",
    ],
    highlighted: false,
  },
];

function BillingContent() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [usageMinutes, setUsageMinutes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    loadBillingData();

    // Handle success/canceled from Stripe
    if (searchParams.get("success") === "true") {
      toast({
        title: "Payment successful!",
        description: "Your subscription is now active.",
      });
    }
    if (searchParams.get("canceled") === "true") {
      toast({
        title: "Payment canceled",
        description: "You can try again when you're ready.",
      });
    }
  }, []);

  const loadBillingData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single() as { data: { organization_id: string } | null };

    if (!membership) return;

    const orgId = membership.organization_id;

    // Get subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("organization_id", orgId)
      .single();

    if (sub) {
      setSubscription(sub);
      setCurrentPlan((sub as { plan_type: string }).plan_type);
    } else {
      setCurrentPlan("free");
    }

    // Get usage
    const { data: usage } = await supabase
      .from("usage_records")
      .select("minutes_used")
      .eq("organization_id", orgId)
      .eq("reported_to_stripe", false) as { data: { minutes_used: number }[] | null };

    const totalMinutes = usage?.reduce((sum, u) => sum + u.minutes_used, 0) || 0;
    setUsageMinutes(Math.round(totalMinutes));

    setIsLoading(false);
  };

  const handleSubscribe = async (planId: string) => {
    if (planId === "free") return;
    setLoadingPlan(planId);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType: planId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create checkout session");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
      });
      setLoadingPlan(null);
    }
  };

  const handleManageBilling = async () => {
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to open billing portal");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open billing portal",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-muted-foreground">
            Manage your subscription and billing
          </p>
        </div>
        {subscription && (
          <Button onClick={handleManageBilling} variant="outline">
            <CreditCard className="mr-2 h-4 w-4" />
            Manage Billing
          </Button>
        )}
      </div>

      {/* Current Plan */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Your active subscription details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold capitalize">
                  {subscription.plan_type.replace("_", " ")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {subscription.included_minutes} minutes included
                </p>
              </div>
              <Badge variant={subscription.status === "active" ? "success" : "secondary"}>
                {subscription.status}
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">
                Usage this period: <span className="font-medium text-foreground">{usageMinutes}</span> / {subscription.included_minutes} minutes
              </p>
              <div className="mt-2 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, (usageMinutes / subscription.included_minutes) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Available Plans</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={plan.highlighted ? "border-primary shadow-md" : ""}
            >
              <CardHeader>
                {plan.highlighted && (
                  <Badge className="mb-2 w-fit">Most Popular</Badge>
                )}
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-3xl font-bold">
                    {plan.price === 0 ? "Free" : formatCurrency(plan.price)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-muted-foreground">/month</span>
                  )}
                </div>
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {currentPlan === plan.id ? (
                  <Button className="w-full" variant="outline" disabled>
                    Current Plan
                  </Button>
                ) : plan.id === "free" ? (
                  <Button className="w-full" variant="outline" disabled>
                    Free Plan
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loadingPlan === plan.id}
                  >
                    {loadingPlan === plan.id && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {currentPlan === "free" ? "Subscribe" : "Upgrade"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  );
}

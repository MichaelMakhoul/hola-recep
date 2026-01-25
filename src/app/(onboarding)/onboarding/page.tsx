"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { BusinessInfo } from "./steps/BusinessInfo";
import { AssistantSetup } from "./steps/AssistantSetup";
import { TestCall } from "./steps/TestCall";
import { GoLive } from "./steps/GoLive";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

interface OnboardingData {
  // Step 1: Business Info
  businessName: string;
  industry: string;
  businessPhone: string;
  businessWebsite: string;
  // Step 2: Assistant Setup
  assistantName: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  // Step 3: Test Call (no data, just completion state)
  testCallCompleted: boolean;
  // Step 4: Go Live
  areaCode: string;
  selectedPlan: string;
}

const initialData: OnboardingData = {
  businessName: "",
  industry: "",
  businessPhone: "",
  businessWebsite: "",
  assistantName: "",
  systemPrompt: "",
  firstMessage: "",
  voiceId: "",
  testCallCompleted: false,
  areaCode: "",
  selectedPlan: "",
};

const steps = [
  { id: 1, name: "Business Info", description: "Tell us about your business" },
  { id: 2, name: "AI Setup", description: "Configure your AI receptionist" },
  { id: 3, name: "Test Call", description: "Try out your AI" },
  { id: 4, name: "Go Live", description: "Choose your plan and phone number" },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  // Load saved progress from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("onboarding_progress");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setData(parsed.data || initialData);
        setCurrentStep(parsed.step || 1);
      } catch {
        // Invalid saved data, start fresh
      }
    }
  }, []);

  // Save progress to localStorage
  useEffect(() => {
    localStorage.setItem(
      "onboarding_progress",
      JSON.stringify({ data, step: currentStep })
    );
  }, [data, currentStep]);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return data.businessName.trim() !== "" && data.industry !== "";
      case 2:
        return (
          data.assistantName.trim() !== "" &&
          data.systemPrompt.trim() !== "" &&
          data.firstMessage.trim() !== "" &&
          data.voiceId !== ""
        );
      case 3:
        return true; // Test call is optional
      case 4:
        return data.areaCode.length === 3 && data.selectedPlan !== "";
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 4 && canProceed()) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = async () => {
    setIsCompleting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "You must be logged in to complete onboarding.",
        });
        setIsCompleting(false);
        return;
      }

      // Step 1: Create organization with owner
      const slug = generateSlug(data.businessName);
      const { data: orgResult, error: orgError } = await (supabase.rpc as any)(
        "create_organization_with_owner",
        {
          org_name: data.businessName,
          org_slug: slug,
          org_type: "business",
        }
      ) as { data: any[] | null; error: any };

      if (orgError || !orgResult || orgResult.length === 0) {
        throw new Error(orgError?.message || "Failed to create organization");
      }

      const orgId = orgResult[0].id;

      // Step 2: Update organization with additional business info
      // Note: Using type assertion due to Supabase SSR client type inference limitation
      const { error: updateOrgError } = await (supabase as any)
        .from("organizations")
        .update({
          industry: data.industry,
          business_phone: data.businessPhone || null,
          business_website: data.businessWebsite || null,
        })
        .eq("id", orgId);

      if (updateOrgError) {
        console.error("Failed to update org details:", updateOrgError);
        // Non-fatal, continue
      }

      // Step 3: Create the AI assistant via API (creates in Vapi + database)
      const assistantResponse = await fetch("/api/v1/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.assistantName,
          systemPrompt: data.systemPrompt,
          firstMessage: data.firstMessage,
          voiceId: data.voiceId || "EXAVITQu4vr4xnSDxMaL",
          voiceProvider: "11labs",
          model: "gpt-4o-mini",
          modelProvider: "openai",
        }),
      });

      if (!assistantResponse.ok) {
        const errorData = await assistantResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create assistant");
      }

      const assistant = await assistantResponse.json();

      // Step 4: Create subscription record (free trial)
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14); // 14-day trial

      const planLimits: Record<string, { calls: number; assistants: number; phoneNumbers: number }> = {
        starter: { calls: 100, assistants: 1, phoneNumbers: 1 },
        professional: { calls: 250, assistants: 3, phoneNumbers: 2 },
        growth: { calls: 999999, assistants: 10, phoneNumbers: 5 }, // "unlimited" represented as high number
      };

      const limits = planLimits[data.selectedPlan] || planLimits.starter;

      const { error: subError } = await (supabase as any).from("subscriptions").insert({
        organization_id: orgId,
        plan_type: data.selectedPlan,
        status: "trialing",
        current_period_start: new Date().toISOString(),
        current_period_end: trialEnd.toISOString(),
        calls_limit: limits.calls,
        calls_used: 0,
        assistants_limit: limits.assistants,
        phone_numbers_limit: limits.phoneNumbers,
        // Placeholder values for trial - will be updated when Stripe is connected
        stripe_price_id: `price_trial_${data.selectedPlan}`,
        stripe_subscription_id: `sub_trial_${Date.now()}`,
      });

      if (subError) {
        console.error("Failed to create subscription:", subError);
        // Non-fatal, continue
      }

      // Step 5: Create notification preferences with defaults
      const { error: notifError } = await (supabase as any)
        .from("notification_preferences")
        .insert({
          organization_id: orgId,
          email_on_missed_call: true,
          email_on_voicemail: true,
          email_daily_summary: true,
          sms_on_missed_call: false,
          sms_on_voicemail: false,
        });

      if (notifError) {
        console.error("Failed to create notification preferences:", notifError);
        // Non-fatal, continue
      }

      // Clear onboarding progress
      localStorage.removeItem("onboarding_progress");

      toast({
        title: "Welcome to Hola Recep!",
        description: "Your AI receptionist is ready. Let's get you a phone number.",
      });

      // Redirect to phone numbers page
      router.push("/phone-numbers?setup=true");
      router.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Something went wrong. Please try again.",
      });
      setIsCompleting(false);
    }
  };

  const progress = (currentStep / 4) * 100;

  return (
    <div className="flex min-h-screen flex-col bg-muted/50">
      {/* Header with Progress */}
      <header className="border-b bg-background px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Set Up Your AI Receptionist</h1>
            <span className="text-sm text-muted-foreground">
              Step {currentStep} of 4
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="mt-3 flex justify-between">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center gap-2 text-sm ${
                  step.id === currentStep
                    ? "font-medium text-primary"
                    : step.id < currentStep
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
                }`}
              >
                {step.id < currentStep ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      step.id === currentStep
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {step.id}
                  </span>
                )}
                <span className="hidden sm:inline">{step.name}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>{steps[currentStep - 1].name}</CardTitle>
              <CardDescription>
                {steps[currentStep - 1].description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentStep === 1 && (
                <BusinessInfo
                  data={{
                    businessName: data.businessName,
                    industry: data.industry,
                    businessPhone: data.businessPhone,
                    businessWebsite: data.businessWebsite,
                  }}
                  onChange={(updates) => updateData(updates)}
                />
              )}

              {currentStep === 2 && (
                <AssistantSetup
                  data={{
                    assistantName: data.assistantName,
                    systemPrompt: data.systemPrompt,
                    firstMessage: data.firstMessage,
                    voiceId: data.voiceId,
                  }}
                  businessInfo={{
                    businessName: data.businessName,
                    industry: data.industry,
                  }}
                  onChange={(updates) => updateData(updates)}
                />
              )}

              {currentStep === 3 && (
                <TestCall
                  assistantData={{
                    assistantName: data.assistantName,
                    systemPrompt: data.systemPrompt,
                    firstMessage: data.firstMessage,
                    voiceId: data.voiceId,
                  }}
                  onTestComplete={() => {
                    updateData({ testCallCompleted: true });
                    handleNext();
                  }}
                />
              )}

              {currentStep === 4 && (
                <GoLive
                  data={{
                    areaCode: data.areaCode,
                    selectedPlan: data.selectedPlan,
                  }}
                  onChange={(updates) => updateData(updates)}
                />
              )}
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1 || isCompleting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {currentStep < 4 ? (
              currentStep === 3 ? (
                // On test call step, show skip button (main continue is in the component)
                <Button
                  variant="ghost"
                  onClick={handleNext}
                  disabled={isCompleting}
                >
                  Skip for now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={!canProceed() || isCompleting}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )
            ) : (
              <Button
                onClick={handleComplete}
                disabled={!canProceed() || isCompleting}
                className="min-w-[140px]"
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Complete Setup
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

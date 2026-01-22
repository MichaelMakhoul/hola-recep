"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/use-toast";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<"business" | "agency">("business");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to create an organization.",
      });
      setIsLoading(false);
      return;
    }

    const slug = generateSlug(orgName);

    // Create organization
    const { data: org, error: orgError } = await (supabase
      .from("organizations") as any)
      .insert({
        name: orgName,
        slug,
        type: orgType,
      })
      .select()
      .single() as { data: { id: string } | null; error: any };

    if (orgError || !org) {
      toast({
        variant: "destructive",
        title: "Error",
        description: orgError?.message || "Failed to create organization",
      });
      setIsLoading(false);
      return;
    }

    // Add user as owner
    const { error: memberError } = await (supabase.from("org_members") as any).insert({
      organization_id: org.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: memberError.message,
      });
      setIsLoading(false);
      return;
    }

    toast({
      title: "Organization created!",
      description: "Welcome to Hola Recep. Let's set up your first AI receptionist.",
    });

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Hola Recep</CardTitle>
          <CardDescription>
            Let&apos;s set up your organization to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateOrganization} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                This is the name of your business or agency
              </p>
            </div>

            <div className="space-y-3">
              <Label>Organization Type</Label>
              <RadioGroup
                value={orgType}
                onValueChange={(v) => setOrgType(v as "business" | "agency")}
                disabled={isLoading}
              >
                <div className="flex items-start space-x-3 rounded-lg border p-4">
                  <RadioGroupItem value="business" id="business" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="business" className="cursor-pointer font-medium">
                      Business (SMB)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      I want to use AI receptionists for my own business
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 rounded-lg border p-4">
                  <RadioGroupItem value="agency" id="agency" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="agency" className="cursor-pointer font-medium">
                      Agency / Reseller
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      I want to offer AI receptionists to my clients
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Organization"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

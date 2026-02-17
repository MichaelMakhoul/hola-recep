import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BusinessSettingsForm } from "./business-settings-form";

export const metadata: Metadata = {
  title: "Settings | Hola Recep",
  description: "Manage your business settings",
};

interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  logo_url: string | null;
  primary_color: string | null;
  business_name: string | null;
  industry: string | null;
  business_website: string | null;
  business_phone: string | null;
  business_address: string | null;
  timezone: string | null;
  country: string | null;
  business_hours: Record<string, { open: string; close: string } | null> | null;
  default_appointment_duration: number | null;
}

interface Membership {
  role: string;
  organizations: Organization;
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = (await supabase
    .from("org_members")
    .select(
      `
      role,
      organizations (
        id, name, slug, type, logo_url, primary_color,
        business_name, industry, business_website, business_phone, business_address,
        timezone, country, business_hours, default_appointment_duration
      )
    `
    )
    .eq("user_id", user.id)
    .single()) as { data: Membership | null };

  if (!membership) {
    redirect("/onboarding");
  }

  const organization = membership.organizations;

  return (
    <>
      <BusinessSettingsForm
        organizationId={organization.id}
        initialData={{
          country: organization.country || "US",
          businessName: organization.business_name || organization.name,
          industry: organization.industry || "",
          websiteUrl: organization.business_website || "",
          phone: organization.business_phone || "",
          address: organization.business_address || "",
          timezone: organization.timezone || "America/New_York",
          businessHours: organization.business_hours || null,
          defaultAppointmentDuration: organization.default_appointment_duration || 30,
        }}
      />

      {/* Branding Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Customize how your AI receptionist appears
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                defaultValue={organization.logo_url || ""}
                placeholder="https://example.com/logo.png"
              />
              <p className="text-xs text-muted-foreground">
                Used for email notifications and reports
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Brand Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primaryColor"
                  defaultValue={organization.primary_color || "#3B82F6"}
                  placeholder="#3B82F6"
                />
                <div
                  className="h-10 w-10 rounded-md border flex-shrink-0"
                  style={{
                    backgroundColor:
                      organization.primary_color || "#3B82F6",
                  }}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button>Save Branding</Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone - Only for owners */}
      {membership.role === "owner" && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible actions for your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Account</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your business and all its data. This
                  cannot be undone.
                </p>
              </div>
              <Button variant="destructive">Delete Account</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

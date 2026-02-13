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
import Link from "next/link";
import { Settings, Users, Key, Building, Bell, Calendar, Globe, BookOpen } from "lucide-react";
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
  website_url: string | null;
  phone: string | null;
  address: string | null;
  timezone: string | null;
  business_hours: Record<string, { open: string; close: string } | null> | null;
  notification_email: string | null;
  notification_phone: string | null;
  notification_preferences: {
    email?: boolean;
    sms?: boolean;
    missedCalls?: boolean;
    voicemails?: boolean;
    appointments?: boolean;
  } | null;
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
        business_name, industry, website_url, phone, address,
        timezone, business_hours, notification_email, notification_phone,
        notification_preferences
      )
    `
    )
    .eq("user_id", user.id)
    .single()) as { data: Membership | null };

  if (!membership) {
    redirect("/onboarding");
  }

  const organization = membership.organizations;
  const isOwnerOrAdmin = ["owner", "admin"].includes(membership.role);

  // Settings navigation - simplified for SMB users
  const settingsLinks = [
    {
      title: "Business Info",
      description: "Basic business settings",
      href: "/settings",
      icon: Building,
      current: true,
    },
    {
      title: "Notifications",
      description: "Email and SMS notifications",
      href: "/settings/notifications",
      icon: Bell,
    },
    {
      title: "Calendar",
      description: "Calendar integration",
      href: "/settings/calendar",
      icon: Calendar,
    },
    {
      title: "Knowledge Base",
      description: "AI knowledge sources",
      href: "/settings/knowledge",
      icon: BookOpen,
    },
    ...(isOwnerOrAdmin
      ? [
          {
            title: "Team",
            description: "Invite team members",
            href: "/settings/team",
            icon: Users,
          },
          {
            title: "API Keys",
            description: "API access for integrations",
            href: "/settings/api-keys",
            icon: Key,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your business and account settings
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Settings Navigation */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4">
            <nav className="space-y-1">
              {settingsLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    link.current
                      ? "bg-muted font-medium"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.title}
                </Link>
              ))}
            </nav>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="space-y-6 lg:col-span-3">
          {/* Business Info - SMB-focused */}
          <BusinessSettingsForm
            organizationId={organization.id}
            initialData={{
              businessName: organization.business_name || organization.name,
              industry: organization.industry || "",
              websiteUrl: organization.website_url || "",
              phone: organization.phone || "",
              address: organization.address || "",
              timezone: organization.timezone || "America/New_York",
              businessHours: organization.business_hours || null,
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
        </div>
      </div>
    </div>
  );
}

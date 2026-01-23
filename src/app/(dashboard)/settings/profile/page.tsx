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
import Link from "next/link";
import { Bell, Building, Calendar, Key, Users, User } from "lucide-react";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Profile Settings | Hola Recep",
  description: "Manage your personal account settings",
};

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await (supabase as any)
    .from("org_members")
    .select("role, organization_id")
    .eq("user_id", user.id)
    .single() as { data: { role: string; organization_id: string } | null };

  if (!membership) {
    redirect("/onboarding");
  }

  const isOwnerOrAdmin = ["owner", "admin"].includes(membership.role);

  const settingsLinks = [
    {
      title: "Profile",
      description: "Your account settings",
      href: "/settings/profile",
      icon: User,
      current: true,
    },
    {
      title: "Business Info",
      description: "Basic business settings",
      href: "/settings",
      icon: Building,
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
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your personal account settings
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
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

        <div className="space-y-6 lg:col-span-3">
          <ProfileForm
            user={{
              id: user.id,
              email: user.email || "",
              fullName: user.user_metadata?.full_name || "",
              avatarUrl: user.user_metadata?.avatar_url || "",
            }}
          />
        </div>
      </div>
    </div>
  );
}

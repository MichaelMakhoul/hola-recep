import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Must be logged in to access onboarding
  if (!user) {
    redirect("/login");
  }

  // Check if user already has an organization
  const { data: memberships } = await supabase
    .from("org_members")
    .select("organization_id")
    .eq("user_id", user.id);

  // If user already has an organization, redirect to dashboard
  if (memberships && memberships.length > 0) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

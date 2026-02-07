"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  Phone,
  PhoneCall,
  CalendarDays,
  Settings,
  CreditCard,
  Users,
  Key,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  logo_url: string | null;
  role: string;
}

interface DashboardSidebarProps {
  organizations: Organization[];
  currentOrgId?: string;
}

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Assistants",
    href: "/assistants",
    icon: Bot,
  },
  {
    name: "Phone Numbers",
    href: "/phone-numbers",
    icon: Phone,
  },
  {
    name: "Calls",
    href: "/calls",
    icon: PhoneCall,
  },
  {
    name: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
  },
];

const secondaryNavigation = [
  {
    name: "Team",
    href: "/settings/team",
    icon: Users,
  },
  {
    name: "API Keys",
    href: "/settings/api-keys",
    icon: Key,
  },
  {
    name: "Billing",
    href: "/billing",
    icon: CreditCard,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function DashboardSidebar({
  organizations,
  currentOrgId,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const currentOrg = organizations.find((o) => o.id === currentOrgId);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Hola Recep</span>
        </Link>
      </div>

      {/* Organization Selector */}
      <div className="border-b p-4">
        <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {currentOrg?.name.charAt(0).toUpperCase() || "O"}
          </div>
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium">
              {currentOrg?.name || "Organization"}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {currentOrg?.type || "business"}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="my-4 border-t" />

        <nav className="space-y-1">
          {secondaryNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs font-medium">Need help?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check our docs or contact support
          </p>
        </div>
      </div>
    </div>
  );
}

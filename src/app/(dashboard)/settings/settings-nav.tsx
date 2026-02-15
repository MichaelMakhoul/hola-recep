"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Building, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const settingsLinks = [
  {
    title: "Business Info",
    href: "/settings",
    icon: Building,
  },
  {
    title: "Notifications",
    href: "/settings/notifications",
    icon: Bell,
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <Card className="lg:col-span-1 h-fit">
      <CardContent className="p-4">
        <nav className="space-y-1">
          {settingsLinks.map((link) => {
            const isActive =
              link.href === "/settings"
                ? pathname === "/settings"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-muted font-medium"
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.title}
              </Link>
            );
          })}
        </nav>
      </CardContent>
    </Card>
  );
}

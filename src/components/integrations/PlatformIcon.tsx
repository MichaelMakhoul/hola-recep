"use client";

import { Webhook, Zap, Grid3X3, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Webhook> = {
  zapier: Zap,
  make: Grid3X3,
  sheets: FileSpreadsheet,
  google_sheets: FileSpreadsheet,
  webhook: Webhook,
};

interface PlatformIconProps {
  platform: string;
  className?: string;
}

export function PlatformIcon({ platform, className }: PlatformIconProps) {
  const Icon = ICONS[platform] || Webhook;
  return <Icon className={cn("h-5 w-5", className)} />;
}

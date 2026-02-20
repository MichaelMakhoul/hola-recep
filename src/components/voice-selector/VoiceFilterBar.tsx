"use client";

import { Button } from "@/components/ui/button";
import { VOICE_FILTERS } from "@/lib/voices";

interface VoiceFilterBarProps {
  activeFilter: string;
  onChange: (filterKey: string) => void;
}

export function VoiceFilterBar({ activeFilter, onChange }: VoiceFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {VOICE_FILTERS.map((f) => (
        <Button
          key={f.key}
          type="button"
          size="sm"
          variant={activeFilter === f.key ? "default" : "outline"}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </Button>
      ))}
    </div>
  );
}

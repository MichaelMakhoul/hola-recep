"use client";

import type { TonePreset } from "@/lib/prompt-builder/types";

interface ToneSelectorProps {
  tone: TonePreset;
  onChange: (tone: TonePreset) => void;
}

const toneOptions: {
  value: TonePreset;
  label: string;
  description: string;
}[] = [
  {
    value: "professional",
    label: "Professional & Formal",
    description: "Polished, business-like language. Great for law firms and medical offices.",
  },
  {
    value: "friendly",
    label: "Friendly & Warm",
    description: "Approachable and conversational while still professional. Works for most businesses.",
  },
  {
    value: "casual",
    label: "Casual & Approachable",
    description: "Relaxed and easy-going. Great for salons, cafes, and creative businesses.",
  },
];

export function ToneSelector({ tone, onChange }: ToneSelectorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {toneOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg border-2 p-4 text-left transition-colors ${
            tone === option.value
              ? "border-primary bg-primary/5"
              : "border-transparent bg-muted/50 hover:border-muted-foreground/25"
          }`}
        >
          <p className="text-sm font-medium">{option.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {option.description}
          </p>
        </button>
      ))}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { playVoicePreview, stopVoicePreview } from "@/lib/audio/voice-preview";
import type { CatalogVoice } from "@/lib/voices";

type PlayState = "idle" | "loading" | "playing";

interface VoiceCardProps {
  voice: CatalogVoice;
  selected: boolean;
  onSelect: () => void;
}

const accentLabel: Record<string, string> = {
  american: "US",
  british: "UK",
  australian: "AU",
};

export function VoiceCard({ voice, selected, onSelect }: VoiceCardProps) {
  const [playState, setPlayState] = useState<PlayState>("idle");

  const handlePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      if (playState === "playing" || playState === "loading") {
        stopVoicePreview();
        setPlayState("idle");
        return;
      }

      setPlayState("loading");
      playVoicePreview(voice.id, {
        text: voice.previewText,
        onStart: () => setPlayState("playing"),
        onEnd: () => setPlayState("idle"),
        onError: () => setPlayState("idle"),
      });
    },
    [playState, voice.id, voice.previewText]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className={`relative cursor-pointer rounded-lg border-2 p-4 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-transparent bg-muted/50 hover:border-muted-foreground/25"
      }`}
    >
      {/* Top row: name + play */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{voice.name}</span>
        <button
          type="button"
          onClick={handlePlay}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          aria-label={playState === "idle" ? `Preview ${voice.name}` : "Stop preview"}
        >
          {playState === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {playState === "playing" && <Square className="h-3 w-3 fill-current" />}
          {playState === "idle" && <Play className="h-3.5 w-3.5 fill-current" />}
        </button>
      </div>

      {/* Gender + accent */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-xs capitalize text-muted-foreground">{voice.gender}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-xs text-muted-foreground">
          {accentLabel[voice.accent] ?? voice.accent}
        </span>
      </div>

      {/* Description */}
      <p className="mt-1 text-xs text-muted-foreground">{voice.description}</p>

      {/* Tags */}
      <div className="mt-2 flex flex-wrap gap-1">
        {voice.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

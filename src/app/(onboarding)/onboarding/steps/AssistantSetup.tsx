"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Volume2 } from "lucide-react";
import { PromptBuilder } from "@/components/prompt-builder";
import type { PromptConfig } from "@/lib/prompt-builder/types";
import { getDefaultConfig } from "@/lib/prompt-builder/defaults";
import { buildPromptFromConfig, generateGreeting } from "@/lib/prompt-builder/generate-prompt";

interface AssistantSetupProps {
  data: {
    assistantName: string;
    systemPrompt: string;
    firstMessage: string;
    voiceId: string;
    promptConfig?: Record<string, any> | null;
  };
  businessInfo: {
    businessName: string;
    industry: string;
  };
  onChange: (data: Partial<AssistantSetupProps["data"]>) => void;
}

const voiceOptions = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Warm, professional female" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Professional, authoritative female" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Friendly, trustworthy male" },
  { id: "jBpfuIE2acCO8z3wKNLl", name: "Emily", description: "Upbeat, enthusiastic female" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", description: "Calm, professional male" },
];

export function AssistantSetup({ data, businessInfo, onChange }: AssistantSetupProps) {
  const hasInitializedRef = useRef(false);
  const lastIndustryRef = useRef(businessInfo.industry);

  // Initialize with defaults on first render or industry change
  useEffect(() => {
    const industryChanged = lastIndustryRef.current !== businessInfo.industry;

    if (businessInfo.industry && (!hasInitializedRef.current || industryChanged)) {
      const defaultConfig = getDefaultConfig(businessInfo.industry);
      const generated = buildPromptFromConfig(defaultConfig, {
        businessName: businessInfo.businessName || "{business_name}",
        industry: businessInfo.industry,
      });
      const greeting = generateGreeting(defaultConfig.tone, businessInfo.businessName);

      onChange({
        assistantName: data.assistantName || `${businessInfo.businessName || "My"} AI Receptionist`,
        systemPrompt: generated,
        firstMessage: greeting,
        voiceId: data.voiceId || "EXAVITQu4vr4xnSDxMaL",
        promptConfig: defaultConfig,
      });

      hasInitializedRef.current = true;
      lastIndustryRef.current = businessInfo.industry;
    }
  }, [businessInfo.industry, businessInfo.businessName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePromptBuilderChange = useCallback(
    (updates: { systemPrompt: string; firstMessage: string; promptConfig: PromptConfig }) => {
      onChange({
        systemPrompt: updates.systemPrompt,
        firstMessage: updates.firstMessage,
        promptConfig: updates.promptConfig,
      });
    },
    [onChange]
  );

  return (
    <div className="space-y-6">
      {/* Assistant Name */}
      <div className="space-y-2">
        <Label htmlFor="assistantName">Assistant Name</Label>
        <Input
          id="assistantName"
          placeholder="My AI Receptionist"
          value={data.assistantName}
          onChange={(e) => onChange({ assistantName: e.target.value })}
        />
      </div>

      {/* Guided Prompt Builder */}
      <PromptBuilder
        config={(data.promptConfig as PromptConfig) || null}
        industry={businessInfo.industry || "other"}
        businessName={businessInfo.businessName || ""}
        systemPrompt={data.systemPrompt}
        firstMessage={data.firstMessage}
        onChange={handlePromptBuilderChange}
        variant="onboarding"
      />

      {/* Greeting Message */}
      <div className="space-y-2">
        <Label htmlFor="firstMessage">Greeting Message</Label>
        <Textarea
          id="firstMessage"
          placeholder="Thank you for calling! How can I help you today?"
          value={data.firstMessage}
          onChange={(e) => onChange({ firstMessage: e.target.value })}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          This is the first thing callers will hear
        </p>
      </div>

      {/* Voice Selection */}
      <div className="space-y-2">
        <Label>Voice Selection</Label>
        <Select
          value={data.voiceId || "none"}
          onValueChange={(v) => onChange({ voiceId: v === "none" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a voice" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select a voice</SelectItem>
            {voiceOptions.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  <span>{voice.name}</span>
                  <span className="text-muted-foreground">- {voice.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choose the voice your AI receptionist will use
        </p>
      </div>
    </div>
  );
}

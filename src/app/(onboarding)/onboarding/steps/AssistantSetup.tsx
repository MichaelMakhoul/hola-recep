"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getTemplateByIndustry, populateTemplate } from "@/lib/templates";
import { Sparkles, Volume2, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface AssistantSetupProps {
  data: {
    assistantName: string;
    systemPrompt: string;
    firstMessage: string;
    voiceId: string;
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
  const [activeTab, setActiveTab] = useState("template");
  const [templateApplied, setTemplateApplied] = useState(false);
  const { toast } = useToast();
  const template = getTemplateByIndustry(businessInfo.industry || "other");

  // Track if we've already populated to avoid infinite loops
  const hasPopulatedRef = useRef(false);
  const lastIndustryRef = useRef(businessInfo.industry);

  useEffect(() => {
    // Auto-populate from template when industry changes
    // Only run once per industry change to avoid loops
    const industryChanged = lastIndustryRef.current !== businessInfo.industry;

    if (businessInfo.industry && activeTab === "template" && (!hasPopulatedRef.current || industryChanged)) {
      const populated = populateTemplate(template, {
        business_name: businessInfo.businessName || "your business",
      });
      onChange({
        assistantName: `${businessInfo.businessName || "My"} AI Receptionist`,
        systemPrompt: populated.systemPrompt,
        firstMessage: populated.firstMessage,
        voiceId: template.voiceId,
      });
      hasPopulatedRef.current = true;
      lastIndustryRef.current = businessInfo.industry;
    }
  }, [businessInfo.industry, businessInfo.businessName, activeTab, template, onChange]);

  const handleUseTemplate = () => {
    const populated = populateTemplate(template, {
      business_name: businessInfo.businessName || "your business",
    });
    onChange({
      assistantName: `${businessInfo.businessName || "My"} AI Receptionist`,
      systemPrompt: populated.systemPrompt,
      firstMessage: populated.firstMessage,
      voiceId: template.voiceId,
    });
    setActiveTab("template");
    setTemplateApplied(true);
    toast({
      title: "Template applied!",
      description: `${template.name} template has been applied to your assistant.`,
    });
    // Reset the applied state after a delay for visual feedback
    setTimeout(() => setTemplateApplied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="assistantName">Assistant Name</Label>
        <Input
          id="assistantName"
          placeholder="My AI Receptionist"
          value={data.assistantName}
          onChange={(e) => onChange({ assistantName: e.target.value })}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="template" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Use Template
          </TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium">{template.name}</h4>
                <p className="text-sm text-muted-foreground">{template.description}</p>
              </div>
              <Badge variant="secondary">{businessInfo.industry || "General"}</Badge>
            </div>
            <Button
              variant={templateApplied ? "default" : "outline"}
              size="sm"
              className="mt-3"
              onClick={handleUseTemplate}
            >
              {templateApplied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Applied!
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Apply Template
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt (Instructions)</Label>
            <Textarea
              id="systemPrompt"
              placeholder="You are a helpful AI receptionist..."
              value={data.systemPrompt}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This tells the AI how to behave and what information it has access to
            </p>
          </div>
        </TabsContent>
      </Tabs>

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

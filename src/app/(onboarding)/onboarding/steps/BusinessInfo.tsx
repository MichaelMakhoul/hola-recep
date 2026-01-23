"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { industryOptions } from "@/lib/templates";

interface BusinessInfoProps {
  data: {
    businessName: string;
    industry: string;
    businessPhone: string;
    businessWebsite: string;
  };
  onChange: (data: Partial<BusinessInfoProps["data"]>) => void;
}

export function BusinessInfo({ data, onChange }: BusinessInfoProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="businessName">Business Name *</Label>
        <Input
          id="businessName"
          placeholder="Acme Dental Practice"
          value={data.businessName}
          onChange={(e) => onChange({ businessName: e.target.value })}
          required
        />
        <p className="text-xs text-muted-foreground">
          This is how your AI receptionist will identify your business
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="industry">Industry *</Label>
        <Select
          value={data.industry || "none"}
          onValueChange={(v) => onChange({ industry: v === "none" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select your industry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select your industry</SelectItem>
            {industryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col">
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          We&apos;ll customize your AI receptionist based on your industry
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessPhone">Business Phone Number</Label>
        <Input
          id="businessPhone"
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={data.businessPhone}
          onChange={(e) => onChange({ businessPhone: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Your current business phone (we&apos;ll help forward calls later)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessWebsite">Website URL (Optional)</Label>
        <Input
          id="businessWebsite"
          type="url"
          placeholder="https://www.example.com"
          value={data.businessWebsite}
          onChange={(e) => onChange({ businessWebsite: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          We can import information from your website to train your AI
        </p>
      </div>
    </div>
  );
}

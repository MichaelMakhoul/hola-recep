"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Building, Clock, Globe } from "lucide-react";
import {
  SUPPORTED_COUNTRIES,
  getCountryConfig,
  getTimezonesForCountry,
} from "@/lib/country-config";

const INDUSTRIES = [
  { value: "dental", label: "Dental Practice" },
  { value: "legal", label: "Law Firm" },
  { value: "home_services", label: "Home Services" },
  { value: "medical", label: "Medical Practice" },
  { value: "real_estate", label: "Real Estate" },
  { value: "other", label: "Other" },
];

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

interface BusinessHours {
  [key: string]: { open: string; close: string } | null;
}

interface BusinessSettingsFormProps {
  organizationId: string;
  initialData: {
    country: string;
    businessName: string;
    industry: string;
    websiteUrl: string;
    phone: string;
    address: string;
    timezone: string;
    businessHours: BusinessHours | null;
  };
}

export function BusinessSettingsForm({
  organizationId,
  initialData,
}: BusinessSettingsFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [country, setCountry] = useState(initialData.country);
  const [businessName, setBusinessName] = useState(initialData.businessName);
  const [industry, setIndustry] = useState(initialData.industry);
  const [websiteUrl, setWebsiteUrl] = useState(initialData.websiteUrl);
  const [phone, setPhone] = useState(initialData.phone);
  const [address, setAddress] = useState(initialData.address);
  const [timezone, setTimezone] = useState(initialData.timezone);
  const [businessHours, setBusinessHours] = useState<BusinessHours>(
    initialData.businessHours || {
      monday: { open: "09:00", close: "17:00" },
      tuesday: { open: "09:00", close: "17:00" },
      wednesday: { open: "09:00", close: "17:00" },
      thursday: { open: "09:00", close: "17:00" },
      friday: { open: "09:00", close: "17:00" },
      saturday: null,
      sunday: null,
    }
  );
  const { toast } = useToast();
  const supabase = createClient();

  const config = getCountryConfig(country);
  const timezones = getTimezonesForCountry(country);

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    const newConfig = getCountryConfig(newCountry);
    // If current timezone isn't in the new country's list, switch to default
    const tzValues = newConfig.timezones.map((t) => t.value);
    if (!tzValues.includes(timezone)) {
      setTimezone(newConfig.defaultTimezone);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const { error } = await (supabase as any)
        .from("organizations")
        .update({
          country,
          business_name: businessName,
          name: businessName, // Keep name in sync
          industry,
          website_url: websiteUrl,
          phone,
          address,
          timezone,
          business_hours: businessHours,
        })
        .eq("id", organizationId);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Your business settings have been updated.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDayOpen = (day: string) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: prev[day] ? null : { open: "09:00", close: "17:00" },
    }));
  };

  const updateDayHours = (
    day: string,
    field: "open" | "close",
    value: string
  ) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: prev[day] ? { ...prev[day]!, [field]: value } : null,
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Business Information
        </CardTitle>
        <CardDescription>
          Tell us about your business so your AI receptionist can serve your
          customers better
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Country */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Country
          </Label>
          <Select value={country} onValueChange={handleCountryChange}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Changing your country affects timezone options and new phone number
            provisioning. Existing phone numbers will continue to work.
          </p>
        </div>

        {/* Basic Info */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name</Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Acme Dental"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue placeholder="Select your industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind.value} value={ind.value}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website URL</Label>
            <Input
              id="websiteUrl"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://acmedental.com"
            />
            <p className="text-xs text-muted-foreground">
              We can import information from your website to train your AI
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Business Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={config.phone.placeholder}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Business Address</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, State 12345"
          />
        </div>

        <Separator />

        {/* Timezone */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timezone
          </Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Business Hours */}
        <div className="space-y-4">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Business Hours
          </Label>
          <p className="text-sm text-muted-foreground">
            Your AI will know when you're open and can inform callers
            accordingly
          </p>

          <div className="space-y-3">
            {DAYS.map((day) => (
              <div
                key={day.key}
                className="flex items-center gap-4 py-2 border-b last:border-0"
              >
                <div className="w-28 flex items-center gap-2">
                  <Switch
                    checked={!!businessHours[day.key]}
                    onCheckedChange={() => toggleDayOpen(day.key)}
                  />
                  <span className="text-sm font-medium">{day.label}</span>
                </div>

                {businessHours[day.key] ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Input
                      type="time"
                      value={businessHours[day.key]?.open || "09:00"}
                      onChange={(e) =>
                        updateDayHours(day.key, "open", e.target.value)
                      }
                      className="w-32"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={businessHours[day.key]?.close || "17:00"}
                      onChange={(e) =>
                        updateDayHours(day.key, "close", e.target.value)
                      }
                      className="w-32"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Business Info
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

interface BrandingFormProps {
  organizationId: string;
  initialLogoUrl: string;
  initialPrimaryColor: string;
}

export function BrandingForm({
  organizationId,
  initialLogoUrl,
  initialPrimaryColor,
}: BrandingFormProps) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await (supabase as any)
        .from("organizations")
        .update({
          logo_url: logoUrl || null,
          primary_color: primaryColor || null,
        })
        .eq("id", organizationId);

      if (error) throw error;

      toast({ title: "Branding updated", description: "Your branding settings have been saved." });
    } catch {
      toast({ title: "Error", description: "Failed to save branding settings.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          Customize how your AI receptionist appears
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-muted-foreground">
              Used for email notifications and reports
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Brand Color</Label>
            <div className="flex gap-2">
              <Input
                id="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#3B82F6"
              />
              <div
                className="h-10 w-10 rounded-md border flex-shrink-0"
                style={{ backgroundColor: primaryColor || "#3B82F6" }}
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Branding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Mail, MessageSquare, Webhook, Bell } from "lucide-react";

interface NotificationPreferences {
  email_on_missed_call: boolean;
  email_on_voicemail: boolean;
  email_on_appointment_booked: boolean;
  email_daily_summary: boolean;
  sms_on_missed_call: boolean;
  sms_on_voicemail: boolean;
  sms_phone_number: string | null;
  webhook_url: string | null;
}

interface NotificationSettingsProps {
  organizationId: string;
  initialPreferences: NotificationPreferences | null;
  userEmail?: string;
}

export function NotificationSettings({
  organizationId,
  initialPreferences,
  userEmail,
}: NotificationSettingsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_on_missed_call: initialPreferences?.email_on_missed_call ?? true,
    email_on_voicemail: initialPreferences?.email_on_voicemail ?? true,
    email_on_appointment_booked: initialPreferences?.email_on_appointment_booked ?? true,
    email_daily_summary: initialPreferences?.email_daily_summary ?? true,
    sms_on_missed_call: initialPreferences?.sms_on_missed_call ?? false,
    sms_on_voicemail: initialPreferences?.sms_on_voicemail ?? false,
    sms_phone_number: initialPreferences?.sms_phone_number ?? "",
    webhook_url: initialPreferences?.webhook_url ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleInputChange = (key: keyof NotificationPreferences, value: string) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value || null,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Check if preferences record exists
      const { data: existing } = await (supabase as any)
        .from("notification_preferences")
        .select("id")
        .eq("organization_id", organizationId)
        .single();

      if (existing) {
        // Update existing
        const { error } = await (supabase as any)
          .from("notification_preferences")
          .update({
            ...preferences,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await (supabase as any)
          .from("notification_preferences")
          .insert({
            organization_id: organizationId,
            ...preferences,
          });

        if (error) throw error;
      }

      toast({
        title: "Settings saved",
        description: "Your notification preferences have been updated.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save notification settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Notifications will be sent to {userEmail || "your account email"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Missed Calls</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when a caller hangs up without speaking to your AI
              </p>
            </div>
            <Switch
              checked={preferences.email_on_missed_call}
              onCheckedChange={() => handleToggle("email_on_missed_call")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Voicemails</Label>
              <p className="text-sm text-muted-foreground">
                Receive voicemail transcripts and audio links via email
              </p>
            </div>
            <Switch
              checked={preferences.email_on_voicemail}
              onCheckedChange={() => handleToggle("email_on_voicemail")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Appointment Bookings</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when your AI books a new appointment
              </p>
            </div>
            <Switch
              checked={preferences.email_on_appointment_booked}
              onCheckedChange={() => handleToggle("email_on_appointment_booked")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Daily Summary</Label>
              <p className="text-sm text-muted-foreground">
                Receive a daily digest of all calls and key metrics
              </p>
            </div>
            <Switch
              checked={preferences.email_daily_summary}
              onCheckedChange={() => handleToggle("email_daily_summary")}
            />
          </div>
        </CardContent>
      </Card>

      {/* SMS Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            SMS Notifications
          </CardTitle>
          <CardDescription>
            Get instant text alerts for important events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smsPhone">Phone Number for SMS</Label>
            <Input
              id="smsPhone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={preferences.sms_phone_number || ""}
              onChange={(e) => handleInputChange("sms_phone_number", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Standard messaging rates may apply
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Missed Calls</Label>
              <p className="text-sm text-muted-foreground">
                Get a text when you miss a call
              </p>
            </div>
            <Switch
              checked={preferences.sms_on_missed_call}
              onCheckedChange={() => handleToggle("sms_on_missed_call")}
              disabled={!preferences.sms_phone_number}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Voicemails</Label>
              <p className="text-sm text-muted-foreground">
                Receive text alerts for new voicemails
              </p>
            </div>
            <Switch
              checked={preferences.sms_on_voicemail}
              onCheckedChange={() => handleToggle("sms_on_voicemail")}
              disabled={!preferences.sms_phone_number}
            />
          </div>
        </CardContent>
      </Card>

      {/* Webhook Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Integration
          </CardTitle>
          <CardDescription>
            Send real-time notifications to your own server or apps
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              type="url"
              placeholder="https://your-server.com/webhook"
              value={preferences.webhook_url || ""}
              onChange={(e) => handleInputChange("webhook_url", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll send POST requests with JSON payload for all call events
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </div>
  );
}

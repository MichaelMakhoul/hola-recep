export interface OrgMembership {
  organization_id: string;
  role?: string;
}

export interface Integration {
  id: string;
  organization_id: string;
  name: string;
  platform: string;
  webhook_url: string;
  signing_secret: string;
  events: string[];
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IntegrationLog {
  id: string;
  integration_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  attempted_at: string;
  retry_count: number;
}

export type IntegrationEvent =
  | "call.completed"
  | "call.started"
  | "call.missed"
  | "voicemail.received";

export const INTEGRATION_EVENTS: { value: IntegrationEvent; label: string }[] = [
  { value: "call.completed", label: "Call Completed" },
  { value: "call.started", label: "Call Started" },
  { value: "call.missed", label: "Call Missed" },
  { value: "voicemail.received", label: "Voicemail Received" },
];

export interface WebhookPayload {
  event: IntegrationEvent;
  timestamp: string;
  data: {
    call_id: string;
    caller_phone: string;
    caller_name: string | null;
    summary: string | null;
    transcript: string | null;
    duration_seconds: number | null;
    assistant_name: string | null;
    outcome: string | null;
    recording_url: string | null;
    collected_data: Record<string, unknown> | null;
  };
}

export interface PlatformInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  setupUrl?: string;
}

export const SUPPORTED_PLATFORMS: PlatformInfo[] = [
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect to 5,000+ apps with no code",
    icon: "zapier",
    setupUrl: "https://zapier.com/app/editor",
  },
  {
    id: "make",
    name: "Make (Integromat)",
    description: "Powerful automation for complex workflows",
    icon: "make",
    setupUrl: "https://www.make.com/en/integromat-scenar",
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Log calls directly to a spreadsheet via Zapier or Make",
    icon: "sheets",
  },
  {
    id: "webhook",
    name: "Custom Webhook",
    description: "Send data to any URL — for developers or custom setups",
    icon: "webhook",
  },
];

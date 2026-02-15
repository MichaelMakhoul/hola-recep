/**
 * Vapi API Client
 * Documentation: https://docs.vapi.ai/
 */

const VAPI_API_URL = "https://api.vapi.ai";

export interface VapiAssistant {
  id: string;
  orgId: string;
  name: string;
  model: {
    provider: string;
    model: string;
    messages?: { role: string; content: string }[];
    systemPrompt?: string;
    temperature?: number;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  transcriber?: {
    provider: string;
    model?: string;
    language?: string;
  };
  endCallFunctionEnabled?: boolean;
  recordingEnabled?: boolean;
  hipaaEnabled?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface VapiPhoneNumber {
  id: string;
  orgId: string;
  number: string;
  provider: string;
  assistantId?: string;
  fallbackDestination?: {
    type: string;
    number?: string;
    sipUri?: string;
  };
  name?: string;
  credentialId: string;
  createdAt: string;
  updatedAt: string;
}

export interface VapiCall {
  id: string;
  orgId: string;
  assistantId?: string;
  phoneNumberId?: string;
  type: "inbound" | "outbound" | "webCall";
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
  cost?: number;
  messages?: Array<{
    role: string;
    content: string;
    time: number;
  }>;
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown>;
    successEvaluation?: string;
  };
  customer?: {
    number?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ServerConfig {
  url: string;
  timeoutSeconds?: number;
  headers?: Record<string, string>;
  credentialId?: string;
}

export interface VapiAnalysisPlan {
  structuredDataPrompt?: string;
  structuredDataSchema?: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  summaryPrompt?: string;
  successEvaluationRubric?: "PassFail" | "NumericScale";
}

export interface VapiToolFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export interface VapiTool {
  type: "function";
  function: VapiToolFunction;
  server?: ServerConfig;
}

export interface VapiStandaloneTool extends VapiTool {
  id: string;
  orgId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAssistantRequest {
  name: string;
  model: {
    provider: string;
    model: string;
    messages?: { role: string; content: string }[];
    systemPrompt?: string;
    temperature?: number;
    toolIds?: string[];
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  transcriber?: {
    provider: string;
    model?: string;
    language?: string;
  };
  server?: ServerConfig;
  endCallFunctionEnabled?: boolean;
  recordingEnabled?: boolean;
  analysisPlan?: VapiAnalysisPlan;
  metadata?: Record<string, unknown>;
}

export interface UpdateAssistantRequest {
  name?: string;
  model?: {
    provider?: string;
    model?: string;
    messages?: { role: string; content: string }[];
    systemPrompt?: string;
    temperature?: number;
    toolIds?: string[];
  };
  voice?: {
    provider?: string;
    voiceId?: string;
  };
  firstMessage?: string;
  transcriber?: {
    provider?: string;
    model?: string;
    language?: string;
  };
  server?: ServerConfig;
  endCallFunctionEnabled?: boolean;
  recordingEnabled?: boolean;
  analysisPlan?: VapiAnalysisPlan;
  metadata?: Record<string, unknown>;
}

export interface BuyPhoneNumberRequest {
  provider?: "vapi" | "twilio" | "vonage" | "telnyx";
  numberDesiredAreaCode?: string;
  assistantId?: string;
  name?: string;
  // For non-vapi providers
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  number?: string;
}

export interface SearchPhoneNumbersRequest {
  areaCode?: string;
  country?: string;
  limit?: number;
}

export interface CreateCallRequest {
  assistantId?: string;
  phoneNumberId?: string;
  customer: {
    number: string;
    name?: string;
  };
  assistantOverrides?: Partial<CreateAssistantRequest>;
}

class VapiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "VapiError";
  }
}

export class VapiClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.VAPI_API_KEY!;
    if (!this.apiKey) {
      throw new Error("VAPI_API_KEY is required");
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${VAPI_API_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new VapiError(
        data?.message || `Request failed with status ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  }

  // ============================================
  // ASSISTANT METHODS
  // ============================================

  async createAssistant(data: CreateAssistantRequest): Promise<VapiAssistant> {
    return this.request<VapiAssistant>("POST", "/assistant", data);
  }

  async getAssistant(assistantId: string): Promise<VapiAssistant> {
    return this.request<VapiAssistant>("GET", `/assistant/${assistantId}`);
  }

  async updateAssistant(
    assistantId: string,
    data: UpdateAssistantRequest
  ): Promise<VapiAssistant> {
    return this.request<VapiAssistant>(
      "PATCH",
      `/assistant/${assistantId}`,
      data
    );
  }

  async deleteAssistant(assistantId: string): Promise<void> {
    await this.request<void>("DELETE", `/assistant/${assistantId}`);
  }

  async listAssistants(): Promise<VapiAssistant[]> {
    return this.request<VapiAssistant[]>("GET", "/assistant");
  }

  // ============================================
  // PHONE NUMBER METHODS
  // ============================================

  async searchPhoneNumbers(
    params: SearchPhoneNumbersRequest
  ): Promise<{ number: string; locality?: string; region?: string; areaCode?: string }[]> {
    // Vapi doesn't have a search endpoint - return mock data showing available area codes
    // Users will specify area code when buying, and Vapi will provision a number
    const areaCode = params.areaCode || "415";

    // Return placeholder showing the area code is available for Vapi SIP numbers
    return [
      {
        number: `+1${areaCode}XXXXXXX`,
        locality: "Available",
        region: params.country || "US",
        areaCode
      }
    ];
  }

  async buyPhoneNumber(data: BuyPhoneNumberRequest): Promise<VapiPhoneNumber> {
    // Default to Vapi's free SIP numbers
    const requestData = {
      provider: data.provider || "vapi",
      numberDesiredAreaCode: data.numberDesiredAreaCode,
      assistantId: data.assistantId,
      name: data.name,
      ...(data.twilioAccountSid && { twilioAccountSid: data.twilioAccountSid }),
      ...(data.twilioAuthToken && { twilioAuthToken: data.twilioAuthToken }),
      ...(data.number && { number: data.number }),
    };
    return this.request<VapiPhoneNumber>("POST", "/phone-number", requestData);
  }

  async getPhoneNumber(phoneNumberId: string): Promise<VapiPhoneNumber> {
    return this.request<VapiPhoneNumber>("GET", `/phone-number/${phoneNumberId}`);
  }

  async updatePhoneNumber(
    phoneNumberId: string,
    data: { assistantId?: string; name?: string }
  ): Promise<VapiPhoneNumber> {
    return this.request<VapiPhoneNumber>(
      "PATCH",
      `/phone-number/${phoneNumberId}`,
      data
    );
  }

  async deletePhoneNumber(phoneNumberId: string): Promise<void> {
    await this.request<void>("DELETE", `/phone-number/${phoneNumberId}`);
  }

  async listPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    return this.request<VapiPhoneNumber[]>("GET", "/phone-number");
  }

  // ============================================
  // CALL METHODS
  // ============================================

  async createCall(data: CreateCallRequest): Promise<VapiCall> {
    return this.request<VapiCall>("POST", "/call", data);
  }

  async getCall(callId: string): Promise<VapiCall> {
    return this.request<VapiCall>("GET", `/call/${callId}`);
  }

  async listCalls(params?: {
    assistantId?: string;
    phoneNumberId?: string;
    limit?: number;
  }): Promise<VapiCall[]> {
    const queryParams = new URLSearchParams();
    if (params?.assistantId) queryParams.set("assistantId", params.assistantId);
    if (params?.phoneNumberId)
      queryParams.set("phoneNumberId", params.phoneNumberId);
    if (params?.limit) queryParams.set("limit", params.limit.toString());

    const queryString = queryParams.toString();
    return this.request<VapiCall[]>(
      "GET",
      `/call${queryString ? `?${queryString}` : ""}`
    );
  }

  async endCall(callId: string): Promise<void> {
    await this.request<void>("POST", `/call/${callId}/stop`);
  }

  // ============================================
  // TOOL METHODS (standalone tools API)
  // ============================================

  async createTool(data: {
    type: "function";
    function: VapiToolFunction;
    server?: ServerConfig;
  }): Promise<VapiStandaloneTool> {
    return this.request<VapiStandaloneTool>("POST", "/tool", data);
  }

  async listTools(): Promise<VapiStandaloneTool[]> {
    return this.request<VapiStandaloneTool[]>("GET", "/tool");
  }

  // ============================================
  // WEB CALL METHODS (for test calls in browser)
  // ============================================

  async createWebCall(data: {
    assistantId?: string;
    assistant?: CreateAssistantRequest;
    assistantOverrides?: Partial<CreateAssistantRequest>;
  }): Promise<{ token: string; callId: string }> {
    return this.request<{ token: string; callId: string }>(
      "POST",
      "/call/web",
      data
    );
  }
}

// Singleton instance
let vapiClient: VapiClient | null = null;

export function getVapiClient(): VapiClient {
  if (!vapiClient) {
    vapiClient = new VapiClient();
  }
  return vapiClient;
}

/** Builds the Vapi webhook server config. Returns undefined if NEXT_PUBLIC_APP_URL is not set. */
export function buildVapiServerConfig(): ServerConfig | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (!appUrl) return undefined;
  return {
    url: `${appUrl}/api/webhooks/vapi`,
    timeoutSeconds: 20,
    ...(webhookSecret && { headers: { "x-webhook-secret": webhookSecret } }),
  };
}

export { VapiError };

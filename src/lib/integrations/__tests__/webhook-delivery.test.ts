import { describe, it, expect, vi, beforeEach } from "vitest";
import { signPayload, buildCallPayload } from "../webhook-delivery";
import crypto from "crypto";

describe("signPayload", () => {
  it("produces a valid HMAC-SHA256 hex signature", () => {
    const payload = '{"event":"call.completed"}';
    const secret = "test-secret-key";

    const result = signPayload(payload, secret);

    // Verify it matches Node.js crypto HMAC
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    expect(result).toBe(expected);
  });

  it("produces different signatures for different secrets", () => {
    const payload = '{"event":"call.completed"}';
    const sig1 = signPayload(payload, "secret-1");
    const sig2 = signPayload(payload, "secret-2");
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different payloads", () => {
    const secret = "test-secret";
    const sig1 = signPayload('{"event":"call.completed"}', secret);
    const sig2 = signPayload('{"event":"call.started"}', secret);
    expect(sig1).not.toBe(sig2);
  });
});

describe("buildCallPayload", () => {
  it("builds correct payload structure", () => {
    const payload = buildCallPayload("call.completed", {
      callId: "abc-123",
      caller: "+61400000000",
      callerName: "John Smith",
      summary: "Booked a dental cleaning",
      transcript: "Hello...",
      duration: 120,
      assistantName: "Dental Reception",
      outcome: "completed",
      recordingUrl: "https://example.com/recording.mp3",
      collectedData: { service: "cleaning" },
    });

    expect(payload.event).toBe("call.completed");
    expect(payload.timestamp).toBeDefined();
    expect(payload.data.call_id).toBe("abc-123");
    expect(payload.data.caller_phone).toBe("+61400000000");
    expect(payload.data.caller_name).toBe("John Smith");
    expect(payload.data.summary).toBe("Booked a dental cleaning");
    expect(payload.data.transcript).toBe("Hello...");
    expect(payload.data.duration_seconds).toBe(120);
    expect(payload.data.assistant_name).toBe("Dental Reception");
    expect(payload.data.outcome).toBe("completed");
    expect(payload.data.recording_url).toBe("https://example.com/recording.mp3");
    expect(payload.data.collected_data).toEqual({ service: "cleaning" });
  });

  it("handles missing optional fields with null", () => {
    const payload = buildCallPayload("call.missed", {
      callId: "abc-123",
      caller: "+61400000000",
    });

    expect(payload.event).toBe("call.missed");
    expect(payload.data.caller_name).toBeNull();
    expect(payload.data.summary).toBeNull();
    expect(payload.data.transcript).toBeNull();
    expect(payload.data.duration_seconds).toBeNull();
    expect(payload.data.assistant_name).toBeNull();
    expect(payload.data.outcome).toBeNull();
    expect(payload.data.recording_url).toBeNull();
    expect(payload.data.collected_data).toBeNull();
  });

  it("includes a valid ISO timestamp", () => {
    const payload = buildCallPayload("call.completed", {
      callId: "abc",
      caller: "+1234567890",
    });

    const date = new Date(payload.timestamp);
    expect(date.toISOString()).toBe(payload.timestamp);
  });
});

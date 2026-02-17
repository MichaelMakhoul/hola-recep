import { describe, it, expect } from "vitest";
import { ensureTimezoneOffset } from "../tool-handlers";

describe("ensureTimezoneOffset", () => {
  // ── Already-offset datetimes should be returned unchanged ──────────────

  it("returns datetime with Z suffix unchanged", () => {
    expect(ensureTimezoneOffset("2026-02-18T10:00:00Z", "America/New_York")).toBe(
      "2026-02-18T10:00:00Z"
    );
  });

  it("returns datetime with positive offset unchanged", () => {
    expect(ensureTimezoneOffset("2026-02-18T10:00:00+11:00", "America/New_York")).toBe(
      "2026-02-18T10:00:00+11:00"
    );
  });

  it("returns datetime with negative offset unchanged", () => {
    expect(ensureTimezoneOffset("2026-02-18T10:00:00-05:00", "Australia/Sydney")).toBe(
      "2026-02-18T10:00:00-05:00"
    );
  });

  it("returns datetime with lowercase z unchanged", () => {
    expect(ensureTimezoneOffset("2026-02-18T10:00:00z", "America/New_York")).toBe(
      "2026-02-18T10:00:00z"
    );
  });

  // ── Naive datetimes get offset appended ────────────────────────────────

  it("appends UTC+0 offset for UTC timezone", () => {
    const result = ensureTimezoneOffset("2026-06-15T12:00:00", "UTC");
    expect(result).toBe("2026-06-15T12:00:00+00:00");
  });

  it("appends correct offset for America/New_York in winter (EST = -05:00)", () => {
    const result = ensureTimezoneOffset("2026-01-15T10:00:00", "America/New_York");
    expect(result).toBe("2026-01-15T10:00:00-05:00");
  });

  it("appends correct offset for America/New_York in summer (EDT = -04:00)", () => {
    const result = ensureTimezoneOffset("2026-07-15T10:00:00", "America/New_York");
    expect(result).toBe("2026-07-15T10:00:00-04:00");
  });

  it("appends correct offset for Australia/Sydney in winter (AEST = +10:00)", () => {
    // July is winter in Australia
    const result = ensureTimezoneOffset("2026-07-15T10:00:00", "Australia/Sydney");
    expect(result).toBe("2026-07-15T10:00:00+10:00");
  });

  it("appends correct offset for Australia/Sydney in summer (AEDT = +11:00)", () => {
    // February is summer in Australia
    const result = ensureTimezoneOffset("2026-02-18T10:00:00", "Australia/Sydney");
    expect(result).toBe("2026-02-18T10:00:00+11:00");
  });

  it("handles India (UTC+5:30) with half-hour offset", () => {
    const result = ensureTimezoneOffset("2026-06-15T14:00:00", "Asia/Kolkata");
    expect(result).toBe("2026-06-15T14:00:00+05:30");
  });

  it("handles Nepal (UTC+5:45) with 45-minute offset", () => {
    const result = ensureTimezoneOffset("2026-06-15T14:00:00", "Asia/Kathmandu");
    expect(result).toBe("2026-06-15T14:00:00+05:45");
  });

  // ── Month boundary crossing ────────────────────────────────────────────

  it("handles month boundary: UTC Jan 31 23:00 → Sydney Feb 1 (positive offset)", () => {
    // At 2026-01-31T23:00:00 UTC, Sydney is 2026-02-01T10:00:00 AEDT (+11)
    // So for a naive datetime of "2026-01-31T23:00:00" treated as UTC reference,
    // the offset for Sydney should be +11:00
    const result = ensureTimezoneOffset("2026-01-31T23:00:00", "Australia/Sydney");
    expect(result).toBe("2026-01-31T23:00:00+11:00");
  });

  it("handles month boundary: UTC Mar 1 01:00 → LA still Feb 28 (negative offset)", () => {
    // At 2026-03-01T01:00:00 UTC, LA is 2026-02-28T17:00:00 PST (-8)
    const result = ensureTimezoneOffset("2026-03-01T01:00:00", "America/Los_Angeles");
    expect(result).toBe("2026-03-01T01:00:00-08:00");
  });

  // ── Year boundary crossing ─────────────────────────────────────────────

  it("handles year boundary: UTC Dec 31 → Sydney Jan 1", () => {
    // At 2025-12-31T20:00:00 UTC, Sydney is 2026-01-01T07:00:00 AEDT (+11)
    const result = ensureTimezoneOffset("2025-12-31T20:00:00", "Australia/Sydney");
    expect(result).toBe("2025-12-31T20:00:00+11:00");
  });

  // ── Unparseable input ──────────────────────────────────────────────────

  it("returns unparseable datetime as-is", () => {
    expect(ensureTimezoneOffset("not-a-date", "America/New_York")).toBe("not-a-date");
  });

  it("returns empty string as-is", () => {
    expect(ensureTimezoneOffset("", "America/New_York")).toBe("");
  });

  // ── Invalid timezone ───────────────────────────────────────────────────

  it("throws RangeError for invalid IANA timezone", () => {
    expect(() =>
      ensureTimezoneOffset("2026-02-18T10:00:00", "Invalid/Timezone")
    ).toThrow(RangeError);
  });
});

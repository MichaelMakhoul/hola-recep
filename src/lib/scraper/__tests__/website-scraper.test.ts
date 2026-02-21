import { describe, it, expect } from "vitest";
import {
  stringField,
  stringArrayField,
  buildCustomInstructionsFromBusinessInfo,
} from "../website-scraper";

describe("stringField", () => {
  it("returns the string when given a string", () => {
    expect(stringField("hello")).toBe("hello");
  });

  it("returns empty string for empty string", () => {
    expect(stringField("")).toBe("");
  });

  it("returns undefined for number", () => {
    expect(stringField(42)).toBeUndefined();
  });

  it("returns undefined for boolean", () => {
    expect(stringField(true)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(stringField(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(stringField(undefined)).toBeUndefined();
  });

  it("returns undefined for object", () => {
    expect(stringField({ name: "test" })).toBeUndefined();
  });

  it("returns undefined for array", () => {
    expect(stringField(["a", "b"])).toBeUndefined();
  });
});

describe("stringArrayField", () => {
  it("returns the array when all elements are strings", () => {
    expect(stringArrayField(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for empty array", () => {
    expect(stringArrayField([])).toEqual([]);
  });

  it("filters out non-string elements", () => {
    expect(stringArrayField(["a", 42, "b", null, "c"])).toEqual(["a", "b", "c"]);
  });

  it("returns empty array when all elements are non-strings", () => {
    expect(stringArrayField([1, 2, true, null])).toEqual([]);
  });

  it("returns undefined for string", () => {
    expect(stringArrayField("hello")).toBeUndefined();
  });

  it("returns undefined for number", () => {
    expect(stringArrayField(42)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(stringArrayField(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(stringArrayField(undefined)).toBeUndefined();
  });

  it("returns undefined for object", () => {
    expect(stringArrayField({ length: 2 })).toBeUndefined();
  });
});

describe("buildCustomInstructionsFromBusinessInfo", () => {
  it("returns empty string for empty info", () => {
    expect(buildCustomInstructionsFromBusinessInfo({})).toBe("");
  });

  it("returns empty string when all fields are undefined", () => {
    expect(
      buildCustomInstructionsFromBusinessInfo({
        name: undefined,
        phone: undefined,
        email: undefined,
      })
    ).toBe("");
  });

  it("includes about when provided", () => {
    const result = buildCustomInstructionsFromBusinessInfo({
      about: "We are a dental clinic in Sydney.",
    });
    expect(result).toContain("About the business: We are a dental clinic in Sydney.");
    expect(result.startsWith("Here is information about the business")).toBe(true);
  });

  it("includes services when provided", () => {
    const result = buildCustomInstructionsFromBusinessInfo({
      services: ["Teeth cleaning", "Whitening", "Root canal"],
    });
    expect(result).toContain("Services offered: Teeth cleaning, Whitening, Root canal");
  });

  it("includes hours when provided", () => {
    const result = buildCustomInstructionsFromBusinessInfo({
      hours: ["Monday: 9am-5pm", "Tuesday: 9am-5pm"],
    });
    expect(result).toContain("Business hours:");
    expect(result).toContain("Monday: 9am-5pm");
    expect(result).toContain("Tuesday: 9am-5pm");
  });

  it("includes address when provided", () => {
    const result = buildCustomInstructionsFromBusinessInfo({
      address: "123 Main St, Sydney NSW 2000",
    });
    expect(result).toContain("Business address: 123 Main St, Sydney NSW 2000");
  });

  it("ignores name, phone, and email (not included in instructions)", () => {
    const result = buildCustomInstructionsFromBusinessInfo({
      name: "Acme Dental",
      phone: "+61 2 1234 5678",
      email: "info@acme.com",
    });
    expect(result).toBe("");
  });

  it("combines all relevant fields with double newline separators", () => {
    const result = buildCustomInstructionsFromBusinessInfo({
      about: "Full-service dental practice.",
      services: ["Cleaning", "Whitening"],
      hours: ["Mon-Fri: 9am-5pm"],
      address: "123 Main St",
    });

    expect(result).toContain("About the business: Full-service dental practice.");
    expect(result).toContain("Services offered: Cleaning, Whitening");
    expect(result).toContain("Business hours:\nMon-Fri: 9am-5pm");
    expect(result).toContain("Business address: 123 Main St");

    // Verify sections are separated by double newlines
    const sections = result.split("\n\n");
    expect(sections.length).toBeGreaterThanOrEqual(5); // header + 4 sections
  });

  it("skips empty services array", () => {
    const result = buildCustomInstructionsFromBusinessInfo({
      services: [],
      about: "A great business.",
    });
    expect(result).not.toContain("Services offered");
    expect(result).toContain("About the business");
  });

  it("skips empty hours array", () => {
    const result = buildCustomInstructionsFromBusinessInfo({
      hours: [],
      about: "A great business.",
    });
    expect(result).not.toContain("Business hours");
    expect(result).toContain("About the business");
  });
});

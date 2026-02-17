import { describe, it, expect } from "vitest";
import { buildSchedulingSection, buildPromptFromConfig } from "../generate-prompt";
import { getDefaultConfig } from "../defaults";

describe("appointment duration in prompts", () => {
  describe("buildSchedulingSection", () => {
    it("should include duration line when non-default duration is provided", () => {
      const section = buildSchedulingSection("America/New_York", undefined, 60);
      expect(section).toContain("Standard appointment duration is 60 minutes.");
    });

    it("should not include duration line when duration is 30 (default)", () => {
      const section = buildSchedulingSection("America/New_York", undefined, 30);
      expect(section).not.toContain("Standard appointment duration");
    });

    it("should not include duration line when duration is undefined", () => {
      const section = buildSchedulingSection("America/New_York", undefined);
      expect(section).not.toContain("Standard appointment duration");
    });

    it("should include duration for 15-minute slots", () => {
      const section = buildSchedulingSection("America/New_York", undefined, 15);
      expect(section).toContain("Standard appointment duration is 15 minutes.");
    });

    it("should include duration for 120-minute slots", () => {
      const section = buildSchedulingSection(undefined, undefined, 120);
      expect(section).toContain("Standard appointment duration is 120 minutes.");
    });

    it("should still include CRITICAL datetime instruction alongside duration", () => {
      const section = buildSchedulingSection("America/New_York", undefined, 45);
      expect(section).toContain("Standard appointment duration is 45 minutes.");
      expect(section).toContain("CRITICAL:");
      expect(section).toContain("get_current_datetime");
    });
  });

  describe("buildPromptFromConfig with duration context", () => {
    it("should include duration when provided in PromptContext", () => {
      const config = getDefaultConfig("dental");
      const prompt = buildPromptFromConfig(config, {
        businessName: "Happy Smiles Dental",
        industry: "dental",
        defaultAppointmentDuration: 45,
      });
      expect(prompt).toContain("Standard appointment duration is 45 minutes.");
    });

    it("should not include duration line when PromptContext has 30", () => {
      const config = getDefaultConfig("dental");
      const prompt = buildPromptFromConfig(config, {
        businessName: "Happy Smiles Dental",
        industry: "dental",
        defaultAppointmentDuration: 30,
      });
      expect(prompt).not.toContain("Standard appointment duration");
    });

    it("should not include duration line when PromptContext omits it", () => {
      const config = getDefaultConfig("dental");
      const prompt = buildPromptFromConfig(config, {
        businessName: "Happy Smiles Dental",
        industry: "dental",
      });
      expect(prompt).not.toContain("Standard appointment duration");
    });
  });
});

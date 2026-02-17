import { describe, it, expect } from "vitest";
import { generateSlots, validateBookingTime } from "../tool-handlers";

describe("generateSlots", () => {
  // 9:00 AM = 540 min, 5:00 PM = 1020 min

  it("generates 16 slots for 30-min duration on 9-5 day", () => {
    const slots = generateSlots("2026-03-15", 540, 1020, 30);
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe("2026-03-15T09:00:00");
    expect(slots[15]).toBe("2026-03-15T16:30:00");
  });

  it("generates 8 slots for 60-min duration on 9-5 day", () => {
    const slots = generateSlots("2026-03-15", 540, 1020, 60);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toBe("2026-03-15T09:00:00");
    expect(slots[7]).toBe("2026-03-15T16:00:00");
  });

  it("generates 32 slots for 15-min duration on 9-5 day", () => {
    const slots = generateSlots("2026-03-15", 540, 1020, 15);
    expect(slots).toHaveLength(32);
    expect(slots[0]).toBe("2026-03-15T09:00:00");
    expect(slots[31]).toBe("2026-03-15T16:45:00");
  });

  it("generates 1 slot for 120-min duration on 9-12 window", () => {
    // 9:00 = 540, 12:00 = 720, window = 180 min
    // 120-min slot fits at 9:00 (ends 11:00), next at 11:00 (ends 13:00 > 12:00) — only 1
    const slots = generateSlots("2026-03-15", 540, 720, 120);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toBe("2026-03-15T09:00:00");
  });

  it("generates 0 slots when duration exceeds the window", () => {
    // 9:00-10:00 = 60 min window, 90 min slot
    const slots = generateSlots("2026-03-15", 540, 600, 90);
    expect(slots).toHaveLength(0);
  });

  it("generates correct slots for 45-min duration on 9-5 day", () => {
    // 480 min window / 45 min = 10.67, so 10 slots (last at 9:00 + 9*45 = 15:45, ends 16:30)
    const slots = generateSlots("2026-03-15", 540, 1020, 45);
    expect(slots).toHaveLength(10);
    expect(slots[0]).toBe("2026-03-15T09:00:00");
    // Last slot: 540 + 9*45 = 945 min = 15:45
    expect(slots[9]).toBe("2026-03-15T15:45:00");
  });

  it("handles non-standard hours like 8:30-16:30", () => {
    // 8:30 = 510, 16:30 = 990, window = 480, 60-min → 8 slots
    const slots = generateSlots("2026-03-15", 510, 990, 60);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toBe("2026-03-15T08:30:00");
    expect(slots[7]).toBe("2026-03-15T15:30:00");
  });
});

describe("validateBookingTime", () => {
  // Business hours 9:00 AM - 5:00 PM (540-1020 min)
  const open = 540;
  const close = 1020;

  it("accepts a 30-min appointment at 9:00 AM", () => {
    expect(validateBookingTime(540, 30, open, close)).toBeNull();
  });

  it("accepts a 30-min appointment at 4:30 PM (ends at 5:00 PM)", () => {
    expect(validateBookingTime(990, 30, open, close)).toBeNull();
  });

  it("rejects a 30-min appointment at 4:45 PM (ends 5:15 PM, past close)", () => {
    expect(validateBookingTime(1005, 30, open, close)).toBe("outside_business_hours");
  });

  it("accepts a 60-min appointment at 4:00 PM (ends 5:00 PM)", () => {
    expect(validateBookingTime(960, 60, open, close)).toBeNull();
  });

  it("rejects a 60-min appointment at 4:30 PM (ends 5:30 PM)", () => {
    expect(validateBookingTime(990, 60, open, close)).toBe("outside_business_hours");
  });

  it("rejects a 90-min appointment at 3:45 PM (ends 5:15 PM)", () => {
    expect(validateBookingTime(945, 90, open, close)).toBe("outside_business_hours");
  });

  it("accepts a 90-min appointment at 3:30 PM (ends 5:00 PM)", () => {
    expect(validateBookingTime(930, 90, open, close)).toBeNull();
  });

  it("rejects appointment before opening", () => {
    expect(validateBookingTime(480, 30, open, close)).toBe("outside_business_hours");
  });

  it("accepts a 120-min appointment at 9:00 AM (ends 11:00 AM)", () => {
    expect(validateBookingTime(540, 120, open, close)).toBeNull();
  });

  it("rejects a 120-min appointment at 3:30 PM (ends 5:30 PM)", () => {
    expect(validateBookingTime(930, 120, open, close)).toBe("outside_business_hours");
  });
});

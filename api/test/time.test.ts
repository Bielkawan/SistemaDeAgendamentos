import { describe, expect, it } from "vitest";
import { addDays, dateKeyIn, zonedToUtc } from "../src/lib/time.js";

describe("time", () => {
  it("converts São Paulo wall time to UTC (UTC-3)", () => {
    expect(zonedToUtc("2026-11-10", 9 * 60, "America/Sao_Paulo").toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });
  it("handles DST zones", () => {
    expect(zonedToUtc("2026-07-01", 9 * 60, "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-01-15", 9 * 60, "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });
  it("derives local date key near midnight", () => {
    expect(dateKeyIn(new Date("2026-11-11T02:30:00Z"), "America/Sao_Paulo")).toBe("2026-11-10");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

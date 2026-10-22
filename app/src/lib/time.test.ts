import { describe, expect, it } from "vitest";
import { dateLabel } from "./time";

describe("dateLabel", () => {
  it("names today, tomorrow, and later days", () => {
    expect(dateLabel("2026-10-22", "2026-10-22")).toBe("Today");
    expect(dateLabel("2026-10-23", "2026-10-22")).toBe("Tomorrow");
    expect(dateLabel("2026-10-24", "2026-10-22")).toBe("Saturday");
  });

  it("gives a past date in full, so it never reads as the coming weekday", () => {
    expect(dateLabel("2026-10-22", "2026-10-30")).toBe("Thu, Oct 22");
  });
});

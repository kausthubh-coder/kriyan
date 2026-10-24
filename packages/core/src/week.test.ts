import { describe, expect, test } from "vitest";
import { weekMath } from "./week.ts";

describe("weekMath", () => {
  test("07:00 to 22:30 with 6 hours of class a weekday leaves 65 hours to plan", () => {
    expect(weekMath(7 * 60, 22 * 60 + 30, 6)).toEqual({ awake: 109, busy: 30, everyday: 14, yours: 65 });
  });

  test("a week too full to plan reads as zero, not a negative number", () => {
    expect(weekMath(9 * 60, 17 * 60, 12).yours).toBe(0);
  });
});

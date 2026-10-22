import { describe, expect, test } from "vitest";
import {
  nextAfterDone,
  occurrences,
  occurrencesBetween,
  sameRepeat,
  validateRepeat,
  type Repeat,
} from "./repeat.ts";

const take = (rule: Repeat, first: string, n: number) => {
  const out: string[] = [];
  for (const d of occurrences(rule, first)) {
    out.push(d);
    if (out.length === n) break;
  }
  return out;
};

describe("occurrences", () => {
  test("a class every Tuesday and Thursday", () => {
    expect(take({ freq: "week", interval: 1, weekdays: [1, 3] }, "2026-10-13", 5)).toEqual([
      "2026-10-13",
      "2026-10-15",
      "2026-10-20",
      "2026-10-22",
      "2026-10-27",
    ]);
  });

  test("a weekly rule starting mid-week skips days before the first date", () => {
    expect(take({ freq: "week", interval: 2, weekdays: [0, 4] }, "2026-10-14", 4)).toEqual([
      "2026-10-16",
      "2026-10-26",
      "2026-10-30",
      "2026-11-09",
    ]);
  });

  test("the last day of every month", () => {
    expect(take({ freq: "month", interval: 1, monthly: { kind: "last" } }, "2026-01-31", 4)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  test("the 31st falls on the last day of shorter months", () => {
    expect(take({ freq: "month", interval: 1, monthly: { kind: "day", day: 31 } }, "2028-01-31", 3)).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
    ]);
  });

  test("the second Tuesday and the last Friday", () => {
    expect(
      take({ freq: "month", interval: 1, monthly: { kind: "nth", n: 2, weekday: 1 } }, "2026-10-13", 3),
    ).toEqual(["2026-10-13", "2026-11-10", "2026-12-08"]);
    expect(
      take({ freq: "month", interval: 1, monthly: { kind: "nth", n: -1, weekday: 4 } }, "2026-10-30", 3),
    ).toEqual(["2026-10-30", "2026-11-27", "2026-12-25"]);
  });

  test("a 29 February birthday lands on 28 February in other years", () => {
    expect(take({ freq: "year", interval: 1 }, "2028-02-29", 3)).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
    ]);
  });

  test("ends after a number of times, or on a date", () => {
    expect(take({ freq: "day", interval: 2, end: { kind: "count", count: 3 } }, "2026-10-13", 10)).toEqual([
      "2026-10-13",
      "2026-10-15",
      "2026-10-17",
    ]);
    expect(
      occurrencesBetween(
        { freq: "week", interval: 1, weekdays: [1, 3], end: { kind: "on", date: "2026-12-11" } },
        "2026-12-01",
        "2026-12-01",
        "2027-01-31",
      ),
    ).toEqual(["2026-12-01", "2026-12-03", "2026-12-08", "2026-12-10"]);
  });
});

describe("nextAfterDone", () => {
  const weekly: Repeat = { freq: "week", interval: 1, weekdays: [1, 3] };

  test("on a schedule, the next occurrence after the one that was done", () => {
    expect(nextAfterDone(weekly, "2026-10-13", "2026-10-15", "2026-10-19")).toBe("2026-10-20");
  });

  test("after done, the interval counts from the day it was done", () => {
    expect(
      nextAfterDone(
        { freq: "day", interval: 2, fromCompletion: true },
        "2026-10-13",
        "2026-10-13",
        "2026-10-16",
      ),
    ).toBe("2026-10-18");
  });

  test("after done, early or late, counts from the day it was done", () => {
    const rule: Repeat = { freq: "day", interval: 2, fromCompletion: true };
    // Due Thu 15 Oct, watered early on Tue 13 Oct: next is Thu, not Sat.
    expect(nextAfterDone(rule, "2026-10-13", "2026-10-15", "2026-10-13", 1)).toBe("2026-10-15");
  });

  test("after done for N times stops after the Nth time", () => {
    const rule: Repeat = { freq: "day", interval: 2, fromCompletion: true, end: { kind: "count", count: 3 } };
    expect(nextAfterDone(rule, "2026-10-13", "2026-10-17", "2026-10-17", 2)).toBe("2026-10-19");
    expect(nextAfterDone(rule, "2026-10-13", "2026-10-19", "2026-10-19", 3)).toBeNull();
  });

  test("returns null once the repeat has ended", () => {
    expect(
      nextAfterDone(
        { freq: "day", interval: 1, end: { kind: "count", count: 2 } },
        "2026-10-13",
        "2026-10-14",
        "2026-10-14",
      ),
    ).toBeNull();
  });
});

test("validateRepeat explains what is wrong", () => {
  expect(validateRepeat({ freq: "week", interval: 1, weekdays: [] })).toBe(
    "Pick at least one day of the week.",
  );
  expect(validateRepeat({ freq: "day", interval: 0 })).toBe(
    "The interval must be a whole number from 1 to 999.",
  );
  expect(validateRepeat({ freq: "month", interval: 1, monthly: { kind: "last" } })).toBeNull();
  expect(validateRepeat({ freq: "month", interval: 1, monthly: { kind: "day", day: 15.5 } })).toBe(
    "The day of the month must be from 1 to 31.",
  );
  expect(validateRepeat({ freq: "day", interval: 1, end: { kind: "on", date: "next week" } })).toBe(
    "The end date must be a date like 2026-12-11.",
  );
  expect(validateRepeat({ freq: "week", interval: 1, weekdays: [0], fromCompletion: true })).toBe(
    "A repeat counted from when it's done can't also pick its days.",
  );
});

test("sameRepeat tells a saved-again rule from a new one", () => {
  const rule: Repeat = { freq: "week", interval: 1, weekdays: [3, 1], end: { kind: "count", count: 6 } };
  expect(
    sameRepeat(rule, { end: { count: 6, kind: "count" }, weekdays: [1, 3], interval: 1, freq: "week" }),
  ).toBe(true);
  expect(sameRepeat(rule, { ...rule, end: { kind: "count", count: 7 } })).toBe(false);
  expect(sameRepeat(rule, undefined)).toBe(false);
  expect(sameRepeat(undefined, undefined)).toBe(true);
});

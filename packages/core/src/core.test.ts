import { describe, expect, test } from "vitest";
import { contrast } from "./color.ts";
import { addDays, todayIn, weekday, zonedInstant } from "./dates.ts";
import {
  describeReminder,
  describeRepeat,
  formatDay,
  formatDuration,
  reminderBody,
  repeatPhrase,
} from "./format.ts";
import { parseTask } from "./parse.ts";
import type { Repeat } from "./repeat.ts";
import { freeMinutes, layoutDay, longestFree } from "./layout.ts";
import { OPS } from "./ops.ts";
import { reminderInstants } from "./reminders.ts";
import { color } from "./tokens.ts";

describe("dates", () => {
  test("weekday is Monday-first", () => {
    expect(weekday("2026-10-12")).toBe(0);
    expect(weekday("2026-10-18")).toBe(6);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("today comes from the person's time zone, not UTC", () => {
    // 03:00 UTC on 14 Oct is still the evening of 13 Oct in New York.
    const instant = Date.UTC(2026, 9, 14, 3, 0);
    expect(todayIn("America/New_York", instant)).toBe("2026-10-13");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-10-14");
  });

  test("zonedInstant handles daylight saving time", () => {
    // 09:00 in New York is 13:00 UTC in summer time and 14:00 UTC after it ends.
    expect(new Date(zonedInstant("2026-10-30", 540, "America/New_York")).toISOString()).toBe(
      "2026-10-30T13:00:00.000Z",
    );
    expect(new Date(zonedInstant("2026-11-02", 540, "America/New_York")).toISOString()).toBe(
      "2026-11-02T14:00:00.000Z",
    );
  });
});

describe("format", () => {
  test("dates read like Tue 13 Oct or Today", () => {
    expect(formatDay("2026-10-13", "2026-10-13")).toBe("Today");
    expect(formatDay("2026-10-14", "2026-10-13")).toBe("Tomorrow");
    expect(formatDay("2026-10-16", "2026-10-13")).toBe("Fri 16 Oct");
    expect(formatDay("2027-01-04", "2026-10-13")).toBe("Mon 4 Jan 2027");
  });

  test("lengths", () => {
    expect([15, 60, 90].map(formatDuration)).toEqual(["15m", "1h", "1h 30m"]);
  });

  test("repeat rules in words", () => {
    expect(
      describeRepeat(
        { freq: "week", interval: 1, weekdays: [1, 3], end: { kind: "on", date: "2026-12-11" } },
        "2026-10-13",
        "2026-10-13",
      ),
    ).toBe("Every Tue and Thu, until Fri 11 Dec");
    expect(describeRepeat({ freq: "week", interval: 1, weekdays: [0, 1, 2, 3, 4] }, "2026-10-13")).toBe(
      "Every weekday",
    );
    expect(
      describeRepeat(
        { freq: "month", interval: 1, monthly: { kind: "nth", n: 2, weekday: 1 } },
        "2026-10-13",
      ),
    ).toBe("Every month on the second Tuesday");
    expect(describeRepeat({ freq: "month", interval: 1 }, "2026-10-13")).toBe("Every month on the 13th");
    expect(describeRepeat({ freq: "year", interval: 1 }, "2026-10-16")).toBe("Every year on 16 Oct");
    expect(describeRepeat({ freq: "day", interval: 2, fromCompletion: true }, "2026-10-13")).toBe(
      "Every 2 days after done",
    ); // Chips list the days with spaces: quick add's "Every Mon Wed Fri".
    const gym = { freq: "week", interval: 1, weekdays: [0, 2, 4] } satisfies Parameters<
      typeof describeRepeat
    >[0];
    expect(describeRepeat(gym, "2026-10-13", undefined, { compact: true })).toBe("Every Mon Wed Fri");
    expect(describeRepeat(gym, "2026-10-13")).toBe("Every Mon, Wed and Fri");
    expect(
      describeRepeat({ freq: "week", interval: 2, weekdays: [1, 3] }, "2026-10-13", undefined, {
        compact: true,
      }),
    ).toBe("Every 2 weeks on Tue Thu");
  });

  test("reminders in words", () => {
    expect(describeReminder({ kind: "before", minutes: 10 })).toBe("10 min before");
    expect(describeReminder({ kind: "before", minutes: 1440 })).toBe("1 day before");
    expect(describeReminder({ kind: "day", offset: -1, time: 1200 })).toBe("Day before at 20:00");
  });
});

describe("reminders", () => {
  test("fire before the start, or on a day at a time, in the person's zone", () => {
    const instants = reminderInstants(
      { date: "2026-10-13", time: 9 * 60 },
      [
        { kind: "before", minutes: 10 },
        { kind: "day", offset: -1, time: 20 * 60 },
      ],
      "America/New_York",
    ).map((i) => new Date(i).toISOString());
    expect(instants).toEqual(["2026-10-13T00:00:00.000Z", "2026-10-13T12:50:00.000Z"]);
  });

  test("a task with no time counts back from 09:00", () => {
    expect(
      reminderInstants({ date: "2026-10-13" }, [{ kind: "before", minutes: 60 }], "UTC").map((i) =>
        new Date(i).toISOString(),
      ),
    ).toEqual(["2026-10-13T08:00:00.000Z"]);
  });

  test("the text says when, from the day it rings", () => {
    // Mum's birthday on Fri 16 Oct, reminded the evening before.
    expect(reminderBody({ date: "2026-10-16" }, "2026-10-15")).toBe("Tomorrow");
    expect(reminderBody({ date: "2026-10-16" }, "2026-10-16")).toBe("Today");
    expect(reminderBody({ date: "2026-10-16", time: 870 }, "2026-10-16")).toBe("Starts at 14:30");
    expect(reminderBody({ date: "2026-10-16", time: 540 }, "2026-10-15")).toBe("Tomorrow at 09:00");
    expect(reminderBody({ date: "2026-10-16", time: 540 }, "2026-10-13")).toBe("Fri 16 Oct at 09:00");
    expect(reminderBody({ date: "2027-01-02" }, "2026-12-30")).toBe("Sat 2 Jan 2027");
  });
});

describe("layout", () => {
  test("overlapping blocks share the width in columns", () => {
    const placed = layoutDay([
      { id: "lunch", start: 780, length: 45 },
      { id: "call", start: 780, length: 60 },
      { id: "run", start: 1050, length: 60 },
    ]);
    expect(placed.map((p) => [p.id, p.column, p.columns])).toEqual([
      ["call", 0, 2],
      ["lunch", 1, 2],
      ["run", 0, 1],
    ]);
  });

  test("a block that starts later sits on top, indented, instead of halving the earlier one", () => {
    const placed = layoutDay([
      { id: "lecture", start: 540, length: 90 },
      { id: "mcp", start: 600, length: 90 },
      { id: "call", start: 610, length: 30 },
      { id: "read", start: 1320 },
    ]);
    expect(placed.map((p) => [p.id, p.column, p.columns, p.depth])).toEqual([
      ["lecture", 0, 1, 0],
      ["mcp", 0, 2, 1],
      ["call", 1, 2, 1],
      ["read", 0, 1, 0],
    ]);
  });

  test("free time from now to the end of the day, overlaps counted once, no-length tasks ignored", () => {
    const items = [
      { id: "a", start: 660, length: 90 },
      { id: "b", start: 780, length: 45 },
      { id: "c", start: 780, length: 60 },
      { id: "d", start: 900 },
    ];
    // From 12:20 to 22:00 is 580 min; busy: 12:20-12:30 (10) and 13:00-14:00 (60).
    expect(freeMinutes(items, 740, 1320)).toBe(510);
  });

  test("the longest free stretch skips planned blocks and stops at a no-length task's time", () => {
    const items = [
      { id: "shift", start: 540, length: 240 },
      { id: "lab", start: 990 },
      { id: "climb", start: 1110, length: 120 },
    ];
    // Free 13:00-16:30 (210) beats 16:30-18:30 (120); 21:00 is the end of the window.
    expect(longestFree(items, 540, 1260)).toEqual([780, 990]);
    expect(longestFree([{ id: "all", start: 480, length: 840 }], 540, 1260)).toBeNull();
    expect(longestFree([], 540, 1260)).toEqual([540, 1260]);
  });
});

test("every text tone keeps 4.5:1 on every surface", () => {
  for (const text of [color.ink, color.ink2, color.ink3, color.now]) {
    for (const surface of [color.bg, color.raised, color.overlay, color.sunken]) {
      expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
    }
  }
});

describe("repeatPhrase", () => {
  const today = "2026-10-12";
  const cases: [Repeat, string][] = [
    [{ freq: "day", interval: 1 }, "every day"],
    [{ freq: "day", interval: 2, fromCompletion: true }, "every 2 days after done"],
    [
      { freq: "week", interval: 1, weekdays: [1, 3], end: { kind: "on", date: "2026-12-11" } },
      "every tue and thu until dec 11",
    ],
    [{ freq: "week", interval: 1, weekdays: [0, 1, 2, 3, 4] }, "every weekday"],
    [{ freq: "week", interval: 2, weekdays: [0] }, "every 2 weeks on mon"],
    [{ freq: "month", interval: 1, monthly: { kind: "day", day: 15 } }, "every 15th"],
    [{ freq: "month", interval: 1, monthly: { kind: "last" } }, "every last day"],
    [
      {
        freq: "month",
        interval: 1,
        monthly: { kind: "nth", n: 2, weekday: 1 },
        end: { kind: "count", count: 10 },
      },
      "every second tue for 10 times",
    ],
    [{ freq: "year", interval: 1 }, "every year"],
  ];
  test.each(cases)("%o reads as %s and parses back to the same rule", (rule, phrase) => {
    expect(repeatPhrase(rule, today)).toBe(phrase);
    expect(parseTask(`x ${phrase}`, today).repeat).toEqual(rule);
  });
});

describe("agent operations", () => {
  test("only writes that create something tell MCP clients they just add", () => {
    // Everything else edits, moves or removes, so a client may ask the person first.
    expect(OPS.filter((op) => op.kind === "write" && !op.destructive).map((op) => op.name)).toEqual([
      "add_task",
      "restore_task",
      "add_space",
      "add_habit",
      "add_goal",
      "propose_plan",
      "answer_ask",
    ]);
  });
});

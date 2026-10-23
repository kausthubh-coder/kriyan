import { describe, expect, test } from "vitest";
import { busyUntil, daySummary, freeAfter, summaryText, type SummaryItem } from "./summary.ts";

const at = (h: number, m = 0) => h * 60 + m;

// Thu 22 Oct at 10:40: a lecture, a lab report, lunch, the lit review, a call with no
// length, a crit, reading; two anytime tasks; a run already done.
const day: SummaryItem[] = [
  { time: at(7, 30), length: 40, done: true, event: false },
  { time: at(9), length: 90, done: false, event: true },
  { time: at(10, 45), length: 90, done: false, event: false },
  { time: at(12, 30), length: 60, done: false, event: true },
  { time: at(14), length: 90, done: false, event: false },
  { time: at(16), length: null, done: false, event: false },
  { time: at(17), length: 45, done: false, event: true },
  { time: null, length: null, done: false, event: false },
  { time: null, length: 15, done: false, event: false },
];

describe("daySummary", () => {
  test("names the day the way Joi does: counts, then when it frees up", () => {
    const parts = daySummary({
      name: "Kausthubh",
      now: at(10, 40),
      dayEnd: at(22, 30),
      items: day,
      habitsDue: 2,
    });
    expect(summaryText(parts)).toBe(
      "Good morning, Kausthubh. You have 3 events, 5 tasks and 2 habits today. You're mostly free after 15:30.",
    );
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual([
      "Kausthubh.",
      "3 events",
      "5 tasks",
      "2 habits",
      "mostly free",
    ]);
    expect(parts.filter((p) => "kind" in p).map((p) => ("kind" in p ? p.kind : ""))).toEqual([
      "event",
      "task",
      "habit",
    ]);
  });

  test("leaves out kinds with none, and the name when there isn't one", () => {
    const parts = daySummary({ now: at(19), dayEnd: at(22, 30), items: [day[8]!], habitsDue: 0 });
    expect(summaryText(parts)).toBe(
      "Good evening. You have 1 task today. You're free for the rest of the day.",
    );
  });

  test("an empty day says so instead of counting zeros", () => {
    expect(summaryText(daySummary({ now: at(13), dayEnd: at(22), items: [], habitsDue: 0 }))).toBe(
      "Good afternoon. Nothing is planned today.",
    );
  });

  test("a day planned to its end is full, not free", () => {
    const blocks = [9, 12, 15, 18].map((h) => ({
      time: at(h),
      length: h === 18 ? 240 : 180,
      done: false,
      event: false,
    }));
    expect(summaryText(daySummary({ now: at(9), dayEnd: at(22), items: blocks, habitsDue: 0 }))).toBe(
      "Good morning. You have 4 tasks today. Your day is full until 22:00.",
    );
  });

  test("one late task with no length doesn't make the day full", () => {
    const parts = daySummary({
      now: at(9, 30),
      dayEnd: at(22),
      items: [
        { time: at(10), length: 90, done: false, event: false },
        { time: at(22), length: null, done: false, event: false },
      ],
      habitsDue: 0,
    });
    expect(summaryText(parts)).toBe("Good morning. You have 2 tasks today. You're mostly free today.");
  });
});

describe("freeAfter", () => {
  test("the day frees up once what's left fills at most a fifth of the time", () => {
    // 10:45 to 15:30 is busy; after 15:30 only a call and a 45 minute crit remain before 22:30.
    expect(freeAfter(day, at(10, 40), at(22, 30))).toBe(at(15, 30));
  });
});

describe("busyUntil", () => {
  test("a task with no length ends where it starts, never at an invented time", () => {
    expect(busyUntil([{ time: at(16), length: null, done: false, event: false }], at(10))).toBe(at(16));
  });

  test("ignores what is done or already over", () => {
    const items = [
      { time: at(8), length: 60, done: false, event: false },
      { time: at(11), length: 30, done: true, event: false },
    ];
    expect(busyUntil(items, at(10))).toBeNull();
  });
});

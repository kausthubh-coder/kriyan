import { describe, expect, test } from "vitest";
import {
  blockHeight,
  daySentence,
  fillLengths,
  fitIn,
  formatSpan,
  nextGap,
  rowFact,
  showsSpaceName,
  timeline,
  type DayItem,
} from "./today.ts";

const at = (h: number, m = 0) => h * 60 + m;
const DAY = "2026-10-26"; // a Monday

let n = 0;
function item(o: Partial<DayItem> & Pick<DayItem, "title">): DayItem {
  return {
    id: `i${n++}`,
    kind: "task",
    time: null,
    length: null,
    spaceId: null,
    spaceName: null,
    color: null,
    done: false,
    proposed: false,
    yearly: false,
    date: DAY,
    deadline: null,
    dueTime: null,
    ...o,
  };
}

// The prototype's Monday: a morning routine, a study block, a class at 13:30, a night routine.
const routine = item({ title: "Morning routine", kind: "routine", time: at(7), length: 75 });
const study = item({ title: "Study for CSC 316 exam 2", time: at(8, 30), length: 90, spaceId: "316" });
const klass = item({ title: "CSC 316 class", kind: "event", time: at(13, 30), length: 75, spaceId: "316" });
const night = item({ title: "Night routine", kind: "routine", time: at(22), length: 20 });
const call = item({ title: "Call Amma", time: at(19, 45) });

describe("timeline", () => {
  test("at 10:40 the past gap hides, the current one starts now and the rest follow in time order", () => {
    const out = timeline({
      items: [klass, study, routine, night, call],
      dayStart: at(7),
      dayEnd: at(22, 30),
      reviewTime: at(20, 30),
      now: at(10, 40),
    });
    const said = out.map((e) =>
      e.kind === "anchor"
        ? e.anchor
        : e.kind === "gap"
          ? `${e.now ? "now " : ""}gap ${e.from}-${e.to}`
          : e.item.title,
    );
    expect(said).toEqual([
      "wake",
      "Morning routine",
      // 08:15 to 08:30 is 15 minutes, but already over.
      "Study for CSC 316 exam 2",
      `now gap ${at(10, 40)}-${at(13, 30)}`,
      "CSC 316 class",
      `gap ${at(14, 45)}-${at(19, 45)}`,
      "Call Amma",
      `gap ${at(19, 45)}-${at(20, 30)}`,
      "review",
      `gap ${at(20, 30)}-${at(22)}`,
      "Night routine",
      "wind",
    ]);
  });

  test("another day shows every gap and no now", () => {
    const out = timeline({ items: [klass], dayStart: at(7), dayEnd: at(22), reviewTime: null, now: null });
    expect(out.filter((e) => e.kind === "gap").map((e) => e.kind === "gap" && [e.from, e.to, e.now])).toEqual(
      [
        [at(7), at(13, 30), false],
        [at(14, 45), at(22), false],
      ],
    );
  });

  test("blocks are sized by length with a floor", () => {
    expect(blockHeight(90)).toBe(95);
    expect(blockHeight(20)).toBe(58);
  });
});

describe("fitIn", () => {
  test("due today, then left from this week, then planned with no time; never what's due in class", () => {
    const hw = item({ title: "Exercise 16", date: null, deadline: DAY, dueTime: at(23, 59), spaceId: "230" });
    const inClass = item({ title: "Quiz", date: null, deadline: DAY, dueTime: at(14), spaceId: "316" });
    const old = item({ title: "Homework 3", date: "2026-10-23", spaceId: "281" });
    const ancient = item({ title: "Old thing", date: "2026-09-01" });
    const laundry = item({ title: "Laundry" });
    const paper = item({ title: "Project part 2", deadline: "2026-11-06", dueTime: at(23, 55) });
    const chips = fitIn({
      day: DAY,
      isToday: true,
      due: [hw, inClass],
      untimed: [laundry, paper],
      earlier: [old, ancient],
      events: [klass],
      window: "week",
    });
    expect(chips.map((c) => `${c.item.title}: ${c.note}`)).toEqual([
      "Exercise 16: due 23:59",
      "Homework 3: 3 days ago",
      "Laundry: any time",
      "Project part 2: due Fri 6 Nov",
    ]);
  });

  test("earlier tasks stay off other days", () => {
    const old = item({ title: "Homework 3", date: "2026-10-23" });
    expect(
      fitIn({
        day: "2026-10-27",
        isToday: false,
        due: [],
        untimed: [],
        earlier: [old],
        events: [],
        window: "all",
      }),
    ).toEqual([]);
  });
});

describe("Fill", () => {
  test("the next gap of 30 minutes starts at the next quarter hour", () => {
    expect(nextGap([study, klass], at(7), at(22), at(10, 40))).toEqual([at(10, 45), at(13, 30)]);
    expect(nextGap([study], at(7), at(9), null)).toEqual([at(7), at(8, 30)]);
  });
  test("lengths never run past the stretch", () => {
    expect(fillLengths(50)).toEqual([30, 45]);
  });
});

describe("rows", () => {
  test("say one fact on the right", () => {
    expect(rowFact(study, { day: DAY, now: at(9) })).toEqual({ text: "Now", now: true });
    expect(rowFact(study, { day: DAY, now: at(12) })).toEqual({ text: "08:30–10:00" });
    expect(
      rowFact(item({ title: "a", deadline: DAY, dueTime: at(23, 59) }), { day: DAY, now: null }),
    ).toEqual({
      text: "Due 23:59",
    });
    expect(rowFact(item({ title: "b", deadline: "2026-10-30" }), { day: DAY, now: null })).toEqual({
      text: "Due Fri",
    });
    expect(rowFact(item({ title: "c", date: "2026-10-23" }), { day: DAY, now: null, left: true })).toEqual({
      text: "3 days ago",
    });
    expect(
      rowFact(item({ title: "Gym", kind: "habit" }), { day: DAY, now: null, habit: { done: 1, target: 3 } }),
    ).toEqual({ text: "1 of 3" });
  });
  test("hide the space name when the title already says it", () => {
    expect(showsSpaceName("CSC 316 class", "CSC 316")).toBe(false);
    expect(showsSpaceName("Homework 3", "CSC 281")).toBe(true);
  });
  test("lengths read the v5 way", () => {
    expect([45, 60, 105, 170].map(formatSpan)).toEqual(["45 min", "1 h", "1 h 45", "2 h 50"]);
  });
});

describe("daySentence", () => {
  test("reads like the prototype's curtain", () => {
    const text = daySentence({
      now: at(10, 40),
      classes: 2,
      due: 3,
      study: { test: "CSC 316 exam", length: 60 },
      habits: 2,
      block: { space: "Kriyan", length: 60 },
      left: 2,
      freeUntil: at(13, 30),
    })
      .map((p) => p.text)
      .join("");
    expect(text).toBe(
      "Good morning. You have 2 classes, 3 things due, an hour of study for CSC 316 exam, 2 habits and an hour on Kriyan today. 2 from this week still open. You're free until 13:30.",
    );
  });
  test("an empty evening", () => {
    const text = daySentence({
      now: at(20),
      classes: 0,
      due: 0,
      study: null,
      habits: 0,
      block: null,
      left: 0,
      freeUntil: null,
    })
      .map((p) => p.text)
      .join("");
    expect(text).toBe("Good evening. Nothing planned today. The rest of the day is yours.");
  });
});

import { describe, expect, test } from "vitest";
import { findTask, freeStretches, interpretAsk, place, type AskContext, type AskTask } from "./ask.ts";

const at = (h: number, m = 0) => h * 60 + m;
const task = (id: string, title: string, rest: Partial<AskTask> = {}): AskTask => ({
  id,
  title,
  date: "2026-10-22",
  time: null,
  length: null,
  event: false,
  done: false,
  ...rest,
});

// Thu 22 Oct at 10:40, the prototype's day.
const ctx: AskContext = {
  today: "2026-10-22",
  now: at(10, 40),
  dayStart: at(7),
  dayEnd: at(22, 30),
  day: [
    task("lecture", "COMP2310 lecture", { time: at(9), length: 90, event: true }),
    task("lab", "Write lab report 4", { time: at(10, 45), length: 90 }),
    task("lunch", "Lunch with Riya", { time: at(12, 30), length: 60, event: true }),
    task("lit", "Thesis: read 3 papers for the lit review", { time: at(14), length: 90 }),
    task("bank", "Call the bank about the new card", { time: at(16) }),
    task("crit", "Design crit", { time: at(17), length: 45, event: true }),
    task("paper", "Buy printer paper"),
    task("email", "Reply to Prof. Lee about the extension", { length: 15 }),
  ],
  inbox: [
    task("draft", "Thesis: draft section 2.1", { date: null, length: 120 }),
    task("bike", "Fix the bike's back brake", { date: null, length: 45 }),
    task("portfolio", "Portfolio: case study for the studio app", { date: null, length: 180 }),
    task("riya", "Plan Riya's surprise", { date: null }),
  ],
  weekMinutes: 270,
  bySpace: [
    { name: "Uni", minutes: 180 },
    { name: "Studio job", minutes: 90 },
  ],
};

describe("freeStretches", () => {
  test("finds the gaps between what's planned, from now to the day's end", () => {
    expect(freeStretches(ctx)).toEqual([
      { from: at(12, 15), to: at(12, 30) },
      { from: at(13, 30), to: at(14) },
      { from: at(15, 30), to: at(17) },
      { from: at(17, 45), to: at(22, 30) },
    ]);
  });
});

describe("place", () => {
  test("fills stretches earliest first, one after another, and never places a task with no length", () => {
    const { placed, unplaced } = place(ctx.inbox, freeStretches(ctx));
    expect(placed.map((p) => [p.task.id, p.at])).toEqual([
      ["draft", at(17, 45)],
      ["bike", at(15, 30)],
    ]);
    expect(unplaced.map((t) => t.id)).toEqual(["portfolio", "riya"]);
  });
});

describe("interpretAsk", () => {
  test("“What do I have time for?” lists the gaps and what from the inbox fits", () => {
    const plan = interpretAsk("What do I have time for?", ctx);
    expect(plan.kind).toBe("free");
    if (plan.kind === "free") expect(plan.fits.map((p) => p.task.id)).toEqual(["draft", "bike"]);
  });

  test("“move the lab report to after lunch” puts it right after lunch today", () => {
    expect(interpretAsk("move the lab report to after lunch", ctx)).toMatchObject({
      kind: "move",
      task: { id: "lab" },
      date: "2026-10-22",
      time: at(13, 30),
    });
  });

  test("a day and a time both count, and so does the inbox", () => {
    expect(interpretAsk("move the bank call to tomorrow at 9am", ctx)).toMatchObject({
      kind: "move",
      task: { id: "bank" },
      date: "2026-10-23",
      time: at(9),
    });
    expect(interpretAsk("push printer paper to friday", ctx)).toMatchObject({
      task: { id: "paper" },
      date: "2026-10-23",
    });
    expect(interpretAsk("move the surprise to the inbox", ctx)).toMatchObject({
      task: { id: "riya" },
      date: null,
      time: null,
    });
  });

  test("a task it can't find is named back, not guessed", () => {
    expect(interpretAsk("move the dentist to friday", ctx)).toEqual({
      kind: "notFound",
      query: "the dentist",
    });
  });

  test("closing the day and planning it", () => {
    expect(interpretAsk("Move what's left to tomorrow", ctx)).toEqual({ kind: "closeDay" });
    const plan = interpretAsk("plan my day", ctx);
    expect(plan.kind).toBe("plan");
    if (plan.kind === "plan") {
      // The 15 minute email fits before lunch; the printer paper has no length, so it stays.
      expect(plan.placements.map((p) => [p.task.id, p.at])).toEqual([
        ["email", at(12, 15)],
        // The 2 h draft doesn't fit the 90 minutes from 15:30, so it waits for the evening.
        ["draft", at(17, 45)],
        ["bike", at(15, 30)],
      ]);
      expect(plan.unplaced.map((t) => t.id)).toEqual(["paper", "portfolio", "riya"]);
    }
  });

  test("how much time went where this week", () => {
    expect(interpretAsk("How much did I work on uni this week?", ctx)).toEqual({
      kind: "stats",
      minutes: 180,
      space: "Uni",
    });
    expect(interpretAsk("how much did I get done", ctx)).toEqual({
      kind: "stats",
      minutes: 270,
      space: null,
    });
  });

  test("“add …” becomes a task; anything else is left for Claude", () => {
    expect(interpretAsk("add Gym tomorrow 7am for 45m", ctx)).toEqual({
      kind: "add",
      text: "Gym tomorrow 7am for 45m",
    });
    expect(interpretAsk("why do I always run late on Thursdays?", ctx)).toEqual({ kind: "unknown" });
  });
});

describe("findTask", () => {
  test("matches on shared words, and prefers today over the inbox", () => {
    expect(findTask("thesis", ctx)?.id).toBe("lit");
    expect(findTask("brake", ctx)?.id).toBe("bike");
    expect(findTask("zzz", ctx)).toBeNull();
  });
});

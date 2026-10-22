/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { todayIn } from "@kriyan/core/dates";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ALICE = {
  tokenIdentifier: "https://clerk.test|user_alice",
  subject: "user_alice",
  issuer: "https://clerk.test",
};
const BOB = {
  tokenIdentifier: "https://clerk.test|user_bob",
  subject: "user_bob",
  issuer: "https://clerk.test",
};

beforeEach(() => {
  vi.useFakeTimers();
  // Tuesday 13 October 2026, 12:00 UTC.
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(ALICE);
  await alice.mutation(api.account.ensureProfile, { timeZone: "UTC" });
  return { t, alice, today: todayIn("UTC") };
}

describe("quick add and today", () => {
  test("a sentence becomes a scheduled, repeating task in a new space", async () => {
    const { alice, today } = await setup();
    await alice.mutation(api.tasks.addText, {
      text: "Calculus lecture every tue and thu 14:00 for 1h30 #school",
    });
    const day = await alice.query(api.views.today, { today });
    expect(day.scheduled.map((t) => [t.title, t.time, t.length, t.spacePath, t.repeatText, t.color])).toEqual(
      [["Calculus lecture", 840, 90, "School", "Every Tue and Thu", "blue"]],
    );
    expect(day.anytime).toEqual([]);
  });

  test("a task without a time is an anytime task; one without a date goes to the inbox", async () => {
    const { alice, today } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Send invoice today" });
    await alice.mutation(api.tasks.addText, { text: "Look into cron limits" });
    expect((await alice.query(api.views.today, { today })).anytime.map((t) => t.title)).toEqual([
      "Send invoice",
    ]);
    expect((await alice.query(api.views.inbox, {})).map((t) => t.title)).toEqual(["Look into cron limits"]);
  });

  test("the week projects repeats forward and sums planned hours per day", async () => {
    const { alice, today } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Gym every mon and wed 7am for 1h" });
    const week = await alice.query(api.views.week, { start: "2026-10-12", today });
    expect(week.days.map((d) => [d.date, d.scheduled.length, d.plannedMinutes])).toEqual([
      ["2026-10-12", 0, 0],
      ["2026-10-13", 0, 0],
      ["2026-10-14", 1, 60],
      ["2026-10-15", 0, 0],
      ["2026-10-16", 0, 0],
      ["2026-10-17", 0, 0],
      ["2026-10-18", 0, 0],
    ]);
  });
});

describe("completing", () => {
  test("a repeating task moves to its next date, and undo puts it back", async () => {
    const { alice } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Water plants every 3 days" });
    const done = await alice.mutation(api.tasks.complete, { id });
    expect(done).toMatchObject({ date: "2026-10-13", finished: false, next: "2026-10-16" });
    expect((await alice.query(api.views.task, { id }))?.date).toBe("2026-10-16");
    await alice.mutation(api.tasks.undoComplete, { id, completion: done });
    expect((await alice.query(api.views.task, { id }))?.date).toBe("2026-10-13");
  });

  test("a single task finishes and shows as done today", async () => {
    const { alice, today } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Book the dentist today" });
    await alice.mutation(api.tasks.complete, { id });
    const day = await alice.query(api.views.today, { today });
    expect(day.anytime).toEqual([]);
    expect(day.done.map((t) => t.title)).toEqual(["Book the dentist"]);
  });

  test("tasks left on earlier days show as from earlier", async () => {
    const { alice } = await setup();
    await alice.mutation(api.tasks.add, { title: "Problem set 3", date: "2026-10-10" });
    expect((await alice.query(api.views.today, { today: "2026-10-13" })).earlier.map((t) => t.title)).toEqual(
      ["Problem set 3"],
    );
  });
});

describe("reminders", () => {
  test("a timed task with reminders schedules one job per future reminder", async () => {
    const { t, alice } = await setup();
    const id = await alice.mutation(api.tasks.addText, {
      text: "Call Mum today 18:00 remind 10m before and 1h before",
    });
    const jobs = await t.run((ctx) => ctx.db.query("reminderJobs").collect());
    expect(jobs.map((j) => [j.taskId, new Date(j.fireAt).toISOString()]).sort()).toEqual([
      [id, "2026-10-13T17:00:00.000Z"],
      [id, "2026-10-13T17:50:00.000Z"],
    ]);
    await alice.mutation(api.tasks.remove, { id });
    expect(await t.run((ctx) => ctx.db.query("reminderJobs").collect())).toEqual([]);
  });
});

describe("ownership", () => {
  test("nobody can read or change another person's task", async () => {
    const { t, alice } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Private task today" });
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    expect(await bob.query(api.views.task, { id })).toBeNull();
    await expect(bob.mutation(api.tasks.update, { id, title: "Hacked" })).rejects.toThrow(
      "That task doesn't exist or isn't yours.",
    );
    expect((await alice.query(api.views.task, { id }))?.title).toBe("Private task");
  });

  test("signed-out calls are refused", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.views.inbox, {})).rejects.toThrow("Sign in to continue.");
  });
});

describe("agent API", () => {
  async function withToken() {
    const ctx = await setup();
    const { token } = await ctx.alice.mutation(api.account.createToken, { name: "Laptop CLI" });
    const call = (op: string, body: unknown, auth = `Bearer ${token}`) =>
      ctx.t.fetch(`/api/v1/${op}`, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    return { ...ctx, token, call };
  }

  test("a token adds a task from a sentence and reads it back on today", async () => {
    const { call } = await withToken();
    const added = await call("add_task", { text: "Standup tomorrow 9:30 for 15m" });
    expect(added.status).toBe(200);
    const day = await call("get_today", { date: "2026-10-14" });
    const body = (await day.json()) as {
      result: { scheduled: { title: string; time: number; length: number }[] };
    };
    expect(body.result.scheduled.map((t) => [t.title, t.time, t.length])).toEqual([["Standup", 570, 15]]);
  });

  test("a wrong token is refused and an unknown operation is named", async () => {
    const { call } = await withToken();
    expect((await call("get_today", {}, "Bearer kriyan_wrong")).status).toBe(401);
    const missing = await call("get_tomorrow", {});
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: 'There\'s no operation called "get_tomorrow". GET /api/v1 lists them.',
    });
  });

  test("a plan arrives as proposals until the person accepts it", async () => {
    const { alice, call, today } = await withToken();
    const res = await call("propose_plan", {
      agent: "Claude",
      blocks: [{ title: "Write launch post", date: today, time: 900, length: 60 }],
    });
    expect(((await res.json()) as { result: { proposed: boolean } }).result.proposed).toBe(true);
    let day = await alice.query(api.views.today, { today });
    expect(day.scheduled.map((t) => [t.title, t.proposedBy])).toEqual([["Write launch post", "Claude"]]);
    await alice.mutation(api.tasks.settleProposals, { accept: true });
    day = await alice.query(api.views.today, { today });
    expect(day.scheduled.map((t) => [t.title, t.proposedBy])).toEqual([["Write launch post", null]]);
  });

  test("validation errors explain what to fix", async () => {
    const { call } = await withToken();
    const res = await call("add_task", { title: "Run", length: 0 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "The length must be from 1 minute to 24 hours." });
  });
});

describe("habits and progress", () => {
  test("checking a habit counts towards this week and shows on progress", async () => {
    const { alice, today } = await setup();
    const id = await alice.mutation(api.organize.addHabit, { title: "Read 20 min", target: 4 });
    await alice.mutation(api.organize.checkHabit, { id, done: true });
    await alice.mutation(api.organize.checkHabit, { id, done: true, date: "2026-10-12" });
    const day = await alice.query(api.views.today, { today });
    expect(day.habits.map((h) => [h.title, h.doneToday, h.thisWeek, h.target])).toEqual([
      ["Read 20 min", true, 2, 4],
    ]);
    const progress = await alice.query(api.views.progress, { today });
    expect(progress.habits[0]!.days.slice(-2)).toEqual([
      { date: "2026-10-12", done: true },
      { date: "2026-10-13", done: true },
    ]);
  });

  test("time done counts towards the week and its space", async () => {
    const { alice, today } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Deep work today 10am for 2h #work" });
    await alice.mutation(api.tasks.complete, { id });
    const progress = await alice.query(api.views.progress, { today });
    expect(progress.weekMinutes).toBe(120);
    expect(progress.bySpace.map((s) => [s.name, s.minutes])).toEqual([["Work", 120]]);
  });
});

describe("moving a repeating task", () => {
  test("moves only this occurrence; the next one keeps its usual day", async () => {
    const { alice, today } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Calculus every tue and thu 9am" });
    await alice.mutation(api.tasks.move, { ids: [id], date: "2026-10-16" });
    const week = await alice.query(api.views.week, { start: "2026-10-12", today });
    expect(week.days.map((d) => [d.date, d.scheduled.map((t) => t.title)])).toEqual([
      ["2026-10-12", []],
      ["2026-10-13", []],
      ["2026-10-14", []],
      ["2026-10-15", []],
      ["2026-10-16", ["Calculus"]],
      ["2026-10-17", []],
      ["2026-10-18", []],
    ]);
    const done = await alice.mutation(api.tasks.complete, { id });
    expect(done.next).toBe("2026-10-20");
  });
});

describe("closing the day", () => {
  test("moves what's open today to tomorrow at the same time; events, done tasks and proposals stay", async () => {
    const { alice, today } = await setup();
    const essay = await alice.mutation(api.tasks.addText, { text: "Essay today 4pm" });
    const dentist = await alice.mutation(api.tasks.addText, { text: "Book the dentist today" });
    const done = await alice.mutation(api.tasks.addText, { text: "Groceries today" });
    await alice.mutation(api.tasks.complete, { id: done });
    await alice.mutation(api.tasks.add, {
      title: "Lecture",
      date: today,
      time: 540,
      length: 90,
      event: true,
    });
    const moved = await alice.mutation(api.tasks.closeDay, { today });
    expect(moved.map((m) => [m.title, m.date, m.time])).toEqual([
      ["Essay", "2026-10-13", 960],
      ["Book the dentist", "2026-10-13", null],
    ]);
    const after = await alice.query(api.views.today, { today });
    expect(after.scheduled.map((t) => t.title)).toEqual(["Lecture"]);
    expect(after.anytime).toEqual([]);
    const week = await alice.query(api.views.week, { start: "2026-10-12", today });
    const wed = week.days.find((d) => d.date === "2026-10-14");
    expect(wed?.scheduled.map((t) => [t.title, t.time])).toEqual([["Essay", 960]]);
    expect(wed?.anytime.map((t) => t.title)).toEqual(["Book the dentist"]);
    // Undo: each goes back to where it was.
    await alice.mutation(api.tasks.move, { ids: [essay], date: today, time: 960 });
    await alice.mutation(api.tasks.move, { ids: [dentist], date: today, time: null });
    const back = await alice.query(api.views.today, { today });
    expect(back.anytime.map((t) => t.title)).toEqual(["Book the dentist"]);
  });
});

describe("deleting my data", () => {
  test("removes every row the person owns, and nobody else's", async () => {
    const { t, alice } = await setup();
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    await bob.mutation(api.tasks.addText, { text: "Bob's task today" });
    const id = await alice.mutation(api.tasks.addText, {
      text: "Call Mum today 18:00 remind 10m before #life",
    });
    await alice.mutation(api.tasks.complete, { id });
    const habit = await alice.mutation(api.organize.addHabit, { title: "Read", target: 3 });
    await alice.mutation(api.organize.checkHabit, { id: habit, done: true });
    await alice.mutation(api.account.createToken, { name: "CLI" });
    await alice.mutation(api.account.deleteMyData, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const owners = await t.run(async (ctx) => {
      const all = await Promise.all(
        (
          [
            "profiles",
            "spaces",
            "tasks",
            "completions",
            "habits",
            "habitChecks",
            "accessTokens",
            "reminderJobs",
          ] as const
        ).map((table) => ctx.db.query(table).collect()),
      );
      return all.flat().map((row) => ("ownerId" in row ? row.ownerId : "?"));
    });
    expect([...new Set(owners)]).toEqual([BOB.tokenIdentifier]);
  });
});

describe("months of use", () => {
  // Done and deleted tasks pile up; lists must still find every open one.
  async function history(
    t: Awaited<ReturnType<typeof setup>>["t"],
    rows: number,
    fields: { date?: string; spaceId?: Id<"spaces"> },
  ) {
    await t.run(async (ctx) => {
      for (let i = 0; i < rows; i++)
        await ctx.db.insert("tasks", {
          ownerId: ALICE.tokenIdentifier,
          title: `Old ${i}`,
          ...fields,
          reminders: [],
          event: false,
          order: i,
          source: "app",
          ...(i % 2 ? { doneAt: 1 } : { deletedAt: Date.now() }),
        });
    });
  }

  test("a new capture shows in the Inbox after 500 done and deleted ones", async () => {
    const { t, alice, today } = await setup();
    await history(t, 520, {});
    await alice.mutation(api.tasks.addText, { text: "New idea" });
    expect((await alice.query(api.views.inbox, {})).map((x) => x.title)).toEqual(["New idea"]);
    expect((await alice.query(api.views.week, { start: "2026-10-12", today })).inbox.map((x) => x.title)).toEqual(
      ["New idea"],
    );
  });

  test("an open task from yesterday stays in From earlier after 500 older done ones", async () => {
    const { t, alice } = await setup();
    await history(t, 520, { date: "2026-01-05" });
    await alice.mutation(api.tasks.add, { title: "Problem set 3", date: "2026-10-12" });
    expect((await alice.query(api.views.today, { today: "2026-10-13" })).earlier.map((x) => x.title)).toEqual([
      "Problem set 3",
    ]);
  });

  test("a space page shows a new task after 500 done ones in that space", async () => {
    const { t, alice, today } = await setup();
    const work = await alice.mutation(api.organize.addSpace, { name: "Work" });
    await history(t, 520, { spaceId: work });
    await alice.mutation(api.tasks.addText, { text: "Draft the launch post #work" });
    const space = await alice.query(api.views.space, { id: work, today });
    expect(space.later.map((x) => x.title)).toEqual(["Draft the launch post"]);
    expect(space.stats.open).toBe(1);
  });
});

describe("the trash", () => {
  test("a deleted task can be restored for 30 days, then it is gone for good", async () => {
    const { t, alice } = await setup();
    const old = await alice.mutation(api.tasks.addText, { text: "Old idea" });
    const recent = await alice.mutation(api.tasks.addText, { text: "Recent idea" });
    await alice.mutation(api.tasks.remove, { id: old });
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    await alice.mutation(api.tasks.remove, { id: recent });
    vi.setSystemTime(new Date("2026-11-13T13:00:00Z"));
    await t.mutation(internal.maintenance.emptyTrash, {});
    const left = await t.run((ctx) => ctx.db.query("tasks").collect());
    expect(left.map((x) => x.title)).toEqual(["Recent idea"]);
    await alice.mutation(api.tasks.restore, { id: recent });
    expect((await alice.query(api.views.inbox, {})).map((x) => x.title)).toEqual(["Recent idea"]);
  });
});

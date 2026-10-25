/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { todayIn } from "@kriyan/core/dates";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { validatorMessage } from "./http";
import schema from "./schema";

// web-push is replaced whole, so the suite never loads its Node-only crypto and nothing is sent.
const webPushMock = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: webPushMock }));

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

  test("a task due today with no day of its own shows on today, once", async () => {
    const { alice, today } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Problem set 4 due today #school" });
    await alice.mutation(api.tasks.addText, { text: "Essay today due today" });
    await alice.mutation(api.tasks.addText, { text: "Lab report due tomorrow" });
    const day = await alice.query(api.views.today, { today });
    expect(day.due.map((t) => [t.title, t.deadline])).toEqual([["Problem set 4", today]]);
    expect(day.anytime.map((t) => t.title)).toEqual(["Essay"]);
  });

  test("a task with a time and no day lands on today, from quick add or an agent", async () => {
    const { t, alice, today } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Water the plants 6pm" });
    await t.mutation(internal.agent.add_task, {
      ownerId: ALICE.tokenIdentifier,
      agent: "Claude",
      title: "Call Mum",
      time: 1020,
    });
    const day = await alice.query(api.views.today, { today });
    expect(day.scheduled.map((x) => [x.title, x.time])).toEqual([
      ["Call Mum", 1020],
      ["Water the plants", 1080],
    ]);
    expect((await alice.query(api.views.inbox, { today: "2026-10-13" })).tasks).toEqual([]);
  });

  test("a task without a time is an anytime task; one without a date goes to the inbox", async () => {
    const { alice, today } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Send invoice today" });
    await alice.mutation(api.tasks.addText, { text: "Look into cron limits" });
    expect((await alice.query(api.views.today, { today })).anytime.map((t) => t.title)).toEqual([
      "Send invoice",
    ]);
    expect((await alice.query(api.views.inbox, { today: "2026-10-13" })).tasks.map((t) => t.title)).toEqual([
      "Look into cron limits",
    ]);
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

describe("Today's month and week dots", () => {
  test("counts what's open and due on each day, and the tasks with no day", async () => {
    const { alice, today } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Problem set 4 due thu 23:55 #school" });
    await alice.mutation(api.tasks.addText, { text: "Lab report due thu 9am" });
    const done = await alice.mutation(api.tasks.addText, { text: "Quiz due wed" });
    await alice.mutation(api.tasks.complete, { id: done, date: null });
    await alice.mutation(api.tasks.addText, { text: "Look into standing desks" });
    const due = await alice.query(api.views.due, { start: today, end: "2026-10-18", today });
    expect(due.days.filter((d) => d.due).map((d) => [d.date, d.due])).toEqual([["2026-10-15", 2]]);
    expect(due.due.map((t) => t.title)).toEqual(["Lab report", "Problem set 4"]);
    // Both due-only tasks and the Inbox one have no day yet.
    expect(due.undated).toBe(3);
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

  test("skipping a repeat moves it to its next date without counting it done", async () => {
    const { alice, today } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Read 20 pages every day" });
    const skipped = await alice.mutation(api.tasks.skip, { id });
    expect(skipped).toEqual({ date: "2026-10-13", next: "2026-10-14" });
    expect((await alice.query(api.views.task, { id }))?.date).toBe("2026-10-14");
    expect((await alice.query(api.views.today, { today })).done).toEqual([]);
    expect((await alice.query(api.views.progress, { today })).weekMinutes).toBe(0);
  });

  test("a single task can't be skipped, so the series rule never deletes it", async () => {
    const { alice } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Book the dentist today" });
    await expect(alice.mutation(api.tasks.skip, { id })).rejects.toThrow("Only a repeating task");
  });

  test("a second tap on a repeat is refused instead of ticking off the next one too", async () => {
    const { alice } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Water plants every 3 days" });
    await alice.mutation(api.tasks.complete, { id, date: "2026-10-13" });
    await expect(alice.mutation(api.tasks.complete, { id, date: "2026-10-13" })).rejects.toThrow(
      "That task is on Fri 16 Oct now, so it wasn't ticked off again.",
    );
    expect((await alice.query(api.views.task, { id }))?.date).toBe("2026-10-16");
  });

  test("unticking a done task takes back what the tick counted", async () => {
    const { t, alice, today } = await setup();
    const goal = await alice.mutation(api.organize.addGoal, {
      title: "Ship 5 things",
      kind: "tasks",
      target: 5,
    });
    const id = await alice.mutation(api.tasks.add, {
      title: "Ship the CLI",
      date: today,
      length: 60,
      goalId: goal,
    });
    await alice.mutation(api.tasks.complete, { id });
    await alice.mutation(api.tasks.reopen, { id });
    await alice.mutation(api.tasks.complete, { id });
    expect((await alice.query(api.views.progress, { today })).weekMinutes).toBe(60);
    expect((await t.run((ctx) => ctx.db.get(goal)))?.current).toBe(1);
  });

  test("undo pressed twice counts once, and only puts a task back on its own date", async () => {
    const { t, alice } = await setup();
    const goal = await alice.mutation(api.organize.addGoal, {
      title: "Ship 5 things",
      kind: "tasks",
      target: 5,
    });
    const id = await alice.mutation(api.tasks.add, { title: "Ship the CLI", goalId: goal });
    const first = await alice.mutation(api.tasks.add, { title: "Earlier win", goalId: goal });
    await alice.mutation(api.tasks.complete, { id: first });
    const done = await alice.mutation(api.tasks.complete, { id });
    await expect(
      alice.mutation(api.tasks.undoComplete, { id, completion: { ...done, date: "2026-10-12<junk>" } }),
    ).rejects.toThrow("That isn't the date this task was done on.");
    await alice.mutation(api.tasks.undoComplete, { id, completion: done });
    await alice.mutation(api.tasks.undoComplete, { id, completion: done });
    expect((await t.run((ctx) => ctx.db.get(goal)))?.current).toBe(1);
    expect((await alice.query(api.views.inbox, { today: "2026-10-13" })).tasks.map((x) => x.title)).toEqual([
      "Ship the CLI",
    ]);
  });

  test("the editor's goal list has the person's open goals, as Progress shows them", async () => {
    const { t, alice, today } = await setup();
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    await bob.mutation(api.organize.addGoal, { title: "Bob's goal", kind: "tasks", target: 2 });
    const run = await alice.mutation(api.organize.addGoal, {
      title: "Run 100 km",
      kind: "number",
      target: 100,
      unit: "km",
      dueDate: "2026-12-31",
    });
    await alice.mutation(api.organize.updateGoal, { id: run, current: 25 });
    const old = await alice.mutation(api.organize.addGoal, { title: "Old goal", kind: "tasks", target: 3 });
    await alice.mutation(api.organize.updateGoal, { id: old, archived: true });

    const goals = await alice.query(api.views.goals, { today });
    expect(goals.map((g) => [g.title, g.current, g.target, g.unit, g.progress])).toEqual([
      ["Run 100 km", 25, 100, "km", 0.25],
    ]);
    expect(goals).toEqual((await alice.query(api.views.progress, { today })).goals);
    await expect(alice.query(api.views.goals, { today: "tomorrow" })).rejects.toThrow();
  });

  test("a finished repeat shows once on its last day", async () => {
    const { alice, today } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Pills every day for 1 times" });
    expect(await alice.mutation(api.tasks.complete, { id })).toMatchObject({ finished: true });
    expect((await alice.query(api.views.today, { today })).done.map((x) => x.title)).toEqual(["Pills"]);
  });

  test("after done for 2 times finishes on the second tick", async () => {
    const { alice } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Read every! 2 days for 2 times" });
    expect(await alice.mutation(api.tasks.complete, { id })).toMatchObject({
      finished: false,
      next: "2026-10-15",
    });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    expect(await alice.mutation(api.tasks.complete, { id })).toMatchObject({ finished: true, next: null });
  });

  test("tasks left on earlier days show as from earlier", async () => {
    const { alice } = await setup();
    await alice.mutation(api.tasks.add, { title: "Problem set 3", date: "2026-10-10" });
    expect((await alice.query(api.views.today, { today: "2026-10-13" })).earlier.map((t) => t.title)).toEqual(
      ["Problem set 3"],
    );
  });

  test("a task due on an earlier day with no day of its own shows as from earlier", async () => {
    const { alice } = await setup();
    await alice.mutation(api.tasks.add, { title: "Workshop 8 coding", deadline: "2026-10-12" });
    await alice.mutation(api.tasks.add, { title: "Workshop 9 coding", deadline: "2026-10-20" });
    await alice.mutation(api.tasks.add, { title: "Read chapter 4" });
    expect((await alice.query(api.views.today, { today: "2026-10-13" })).earlier.map((t) => t.title)).toEqual(
      ["Workshop 8 coding"],
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

  const pending = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((f) => f.state.kind === "pending")
        .map((f) => f.args[0] as { taskId: Id<"tasks">; fireAt: number; date: string }),
    );

  test("a repeating class rings before every lecture, not only the first", async () => {
    const { t, alice } = await setup();
    // Tuesday 13 Oct, 12:00: today's 09:00 lecture is over, so Thursday's rings next.
    await alice.mutation(api.tasks.add, {
      title: "Calculus lecture",
      date: "2026-10-13",
      time: 540,
      length: 90,
      event: true,
      repeat: { freq: "week", interval: 1, weekdays: [1, 3] },
    });
    expect((await pending(t)).map((j) => [j.date, new Date(j.fireAt).toISOString()])).toEqual([
      ["2026-10-15", "2026-10-15T08:50:00.000Z"],
    ]);
    // Thursday's reminder rings; the next lecture, Tuesday the 20th, gets its own.
    vi.advanceTimersToNextTimer();
    await t.finishInProgressScheduledFunctions();
    expect((await pending(t)).map((j) => [j.date, new Date(j.fireAt).toISOString()])).toEqual([
      ["2026-10-20", "2026-10-20T08:50:00.000Z"],
    ]);
  });

  test("a daily task added after today's time still rings tomorrow morning", async () => {
    const { t, alice } = await setup();
    // Noon on Tuesday: today's 08:00 has passed and today's isn't ticked off.
    await alice.mutation(api.tasks.addText, { text: "Take meds every day 8am remind 10m before" });
    expect((await pending(t)).map((j) => [j.date, new Date(j.fireAt).toISOString()])).toEqual([
      ["2026-10-14", "2026-10-14T07:50:00.000Z"],
    ]);
  });

  test("a reminder the evening before says Tomorrow, not Today", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.tasks.addText, {
      text: "Mum's birthday 16 oct every year remind day before at 20:00",
    });
    const [job] = await pending(t);
    expect(new Date(job!.fireAt).toISOString()).toBe("2026-10-15T20:00:00.000Z");
    expect(await t.query(internal.reminders.payload, job!)).toEqual({
      ownerId: ALICE.tokenIdentifier,
      title: "Mum's birthday",
      body: "Tomorrow",
      tokens: [],
      web: [],
    });
  });

  test("the push goes out at high priority with the task and when it is", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.account.registerPush, {
      token: "ExponentPushToken[phone]",
      platform: "android",
    });
    await alice.mutation(api.tasks.addText, { text: "Dentist tomorrow 9am remind day before at 20:00" });
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(...(JSON.parse(String(init.body)) as unknown[]));
      return new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 });
    });
    try {
      vi.advanceTimersToNextTimer();
      await t.finishInProgressScheduledFunctions();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sent).toEqual([
      {
        to: "ExponentPushToken[phone]",
        title: "Dentist",
        body: "Tomorrow at 09:00",
        sound: "default",
        channelId: "reminders",
        priority: "high",
        data: { taskId: expect.any(String) },
      },
    ]);
  });

  test("an accepted proposal rings like any other task", async () => {
    const { t, alice, today } = await setup();
    await t.mutation(internal.agent.propose_plan, {
      ownerId: ALICE.tokenIdentifier,
      agent: "Claude",
      blocks: [{ title: "Write launch post", date: today, time: 900, length: 60 }],
    });
    // While it's only a proposal, nothing rings.
    expect(await pending(t)).toEqual([]);
    await alice.mutation(api.tasks.settleProposals, { accept: true });
    expect((await pending(t)).map((j) => new Date(j.fireAt).toISOString())).toEqual([
      "2026-10-13T14:50:00.000Z",
    ]);
  });

  test("moving to another time zone moves a pending reminder to the same clock time there", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Call Mum today 18:00 remind 10m before" });
    expect((await pending(t)).map((j) => new Date(j.fireAt).toISOString())).toEqual([
      "2026-10-13T17:50:00.000Z",
    ]);
    // Kolkata is UTC+5:30, so 17:50 there is 12:20 UTC, still ahead of now (12:00 UTC).
    await alice.mutation(api.account.ensureProfile, { timeZone: "Asia/Kolkata" });
    vi.advanceTimersToNextTimer();
    await t.finishInProgressScheduledFunctions();
    expect((await pending(t)).map((j) => new Date(j.fireAt).toISOString())).toEqual([
      "2026-10-13T12:20:00.000Z",
    ]);
  });

  test("a reminder an agent set before the first sign-in rings on the person's clock", async () => {
    const t = convexTest(schema, modules);
    // No profile yet, so the server places it on UTC's clock.
    await t.mutation(internal.agent.add_task, {
      ownerId: ALICE.tokenIdentifier,
      agent: "Claude",
      text: "Call Mum today 18:00 remind 10m before",
    });
    expect((await pending(t)).map((j) => new Date(j.fireAt).toISOString())).toEqual([
      "2026-10-13T17:50:00.000Z",
    ]);
    await t.withIdentity(ALICE).mutation(api.account.ensureProfile, { timeZone: "Asia/Kolkata" });
    vi.advanceTimersToNextTimer();
    await t.finishInProgressScheduledFunctions();
    expect((await pending(t)).map((j) => new Date(j.fireAt).toISOString())).toEqual([
      "2026-10-13T12:20:00.000Z",
    ]);
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
    await expect(t.query(api.views.inbox, { today: "2026-10-13" })).rejects.toThrow("Sign in to continue.");
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
    const wrong = await call("get_today", {}, "Bearer kriyan_wrong");
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({
      error: "That token doesn't work: it may have been revoked or mistyped. Create a new one in Settings.",
    });
    const missing = await call("get_tomorrow", {});
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: 'There\'s no operation called "get_tomorrow". GET /api/v1 lists them.',
    });
  });

  test("a goal says why it matters and what's next, from the app or an agent", async () => {
    const { alice, call, today } = await withToken();
    const added = await call("add_goal", {
      title: "Finish the semester with a distinction",
      why: "  Keeps the honours scholarship open. ",
      kind: "tasks",
      target: 5,
    });
    expect(added.status).toBe(200);
    const { goalId } = ((await added.json()) as { result: { goalId: Id<"goals"> } }).result;
    const plain = await alice.mutation(api.organize.addGoal, {
      title: "Read 24 books",
      kind: "tasks",
      target: 24,
    });
    // Linked open tasks: the soonest dated one is next, before an undated one and a later one.
    await alice.mutation(api.tasks.add, { title: "Outline the thesis", goalId });
    await alice.mutation(api.tasks.add, { title: "Lab report 5", goalId, date: "2026-10-20" });
    await alice.mutation(api.tasks.add, { title: "Lab report 4", goalId, date: today, time: 900 });
    const done = await alice.mutation(api.tasks.add, {
      title: "Lab report 3",
      goalId,
      date: today,
      time: 600,
    });
    await alice.mutation(api.tasks.complete, { id: done });
    await call("propose_plan", {
      agent: "Claude",
      blocks: [{ title: "Study block", date: today, time: 480, length: 60 }],
    });

    const shown = async () =>
      (await alice.query(api.views.progress, { today })).goals.map((g) => [
        g.title,
        g.why,
        g.next?.title ?? null,
      ]);
    expect(await shown()).toEqual([
      ["Finish the semester with a distinction", "Keeps the honours scholarship open.", "Lab report 4"],
      ["Read 24 books", null, null],
    ]);

    await call("update_goal", { goalId, why: null });
    await alice.mutation(api.organize.updateGoal, { id: plain, why: "One a fortnight" });
    expect(await shown()).toEqual([
      ["Finish the semester with a distinction", null, "Lab report 4"],
      ["Read 24 books", "One a fortnight", null],
    ]);
    await alice.mutation(api.organize.updateGoal, { id: plain, why: "   " });
    expect((await shown())[1]).toEqual(["Read 24 books", null, null]);
    await expect(
      alice.mutation(api.organize.updateGoal, { id: plain, why: "x".repeat(301) }),
    ).rejects.toThrow("Keep the reason under 300 characters, a line or two.");
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

  test("an agent can take back a wrong tick and bring back a task it deleted", async () => {
    const { call } = await withToken();
    const { taskId } = (
      (await (await call("add_task", { text: "Water plants every 3 days" })).json()) as {
        result: { taskId: string };
      }
    ).result;
    const done = (
      (await (await call("complete_task", { taskId, date: "2026-10-13" })).json()) as {
        result: { completionId: string; date: string; next: string };
      }
    ).result;
    expect(done).toMatchObject({ date: "2026-10-13", next: "2026-10-16" });
    // A retry of the same call is refused rather than ticking the 16th too.
    expect((await call("complete_task", { taskId, date: "2026-10-13" })).status).toBe(400);
    // reopen_task can't help with a repeat, and says so.
    expect(await (await call("reopen_task", { taskId })).json()).toEqual({
      error:
        "That task isn't done: a repeat moves to its next date when it's ticked off. Undo the tick instead.",
    });
    expect(
      (await call("undo_complete", { taskId, completionId: done.completionId, date: done.date })).status,
    ).toBe(200);
    const today = (await (await call("get_today", {})).json()) as {
      result: { anytime: { title: string }[] };
    };
    expect(today.result.anytime.map((t) => t.title)).toEqual(["Water plants"]);
    await call("delete_task", { taskId });
    await call("restore_task", { taskId });
    const again = (await (await call("get_today", {})).json()) as {
      result: { anytime: { title: string }[] };
    };
    expect(again.result.anytime.map((t) => t.title)).toEqual(["Water plants"]);
  });

  test("validation errors explain what to fix", async () => {
    const { call } = await withToken();
    const res = await call("add_task", { title: "Run", length: 0 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "The length must be from 1 minute to 24 hours." });
  });

  test("a write returns the task as saved, and get_task reads one back with its note", async () => {
    const { call, t } = await withToken();
    const added = (await (await call("add_task", { text: "Mum's birthday 16 oct every year" })).json()) as {
      result: { taskId: string; task: { title: string; date: string; repeat: { freq: string } } };
    };
    expect(added.result.task).toMatchObject({
      title: "Mum's birthday",
      date: "2026-10-16",
      repeat: { freq: "year" },
    });
    const { taskId } = added.result;
    const updated = (await (await call("update_task", { taskId, note: "Card and flowers" })).json()) as {
      result: { task: { note: string } };
    };
    expect(updated.result.task.note).toBe("Card and flowers");
    const read = (await (await call("get_task", { taskId })).json()) as {
      result: { title: string; note: string };
    };
    expect(read.result).toMatchObject({ title: "Mum's birthday", note: "Card and flowers" });
    // Someone else's task is refused, like every other op.
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    const bobs = await bob.mutation(api.tasks.addText, { text: "Bob's plans" });
    expect((await call("get_task", { taskId: bobs })).status).toBe(400);
  });

  test("a read for a day that isn't a date says how to write one", async () => {
    const { call } = await withToken();
    // It used to answer 200 with nothing planned and every open task "from earlier".
    const day = await call("get_today", { date: "Friday" });
    expect(day.status).toBe(400);
    expect(await day.json()).toEqual({ error: "The date must look like 2026-10-13." });
    // ...and a week of days dated 0NaN-NaN-NaN.
    const week = await call("get_week", { start: "next monday" });
    expect(week.status).toBe(400);
    expect(await week.json()).toEqual({ error: "The start must look like 2026-10-13." });
  });

  test("a validator error names the field without echoing the request and its owner id", () => {
    // What the real backend says for add_task {"title":"x","bogus":1}, owner id shortened.
    const echoed =
      "ArgumentValidationError: Object contains extra field `bogus` that is not in the validator.\n\n" +
      'Object: {bogus: 1.0, ownerId: "https://example.clerk.accounts.dev|user_3Kc", title: "x"}\n' +
      "Validator: v.object({ownerId: v.string(), title: v.optional(v.string())})";
    expect(validatorMessage(echoed)).toBe(
      "ArgumentValidationError: Object contains extra field `bogus` that is not in the validator.",
    );
    expect(
      validatorMessage(
        'ArgumentValidationError: Value does not match validator.\nPath: .length\nValue: "long"\nValidator: v.float64()',
      ),
    ).toBe('ArgumentValidationError: Value does not match validator. Path: .length Value: "long"');
    expect(validatorMessage("TypeError: x is undefined")).toBeNull();
  });

  test("the site's service secret acts for a Clerk user id, and only an exact secret works", async () => {
    const { t, alice } = await withToken();
    await alice.mutation(api.tasks.addText, { text: "Book the dentist" });
    const secret = "s".repeat(64);
    vi.stubEnv("KRIYAN_SERVICE_SECRET", secret);
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", ALICE.issuer);
    const inbox = (bearer: string, user: string) =>
      t.fetch("/api/v1/get_inbox", {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "x-kriyan-user": user },
      });
    try {
      const res = await inbox(secret, ALICE.subject);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { result: { tasks: { title: string }[] } };
      expect(body.result.tasks.map((x) => x.title)).toEqual(["Book the dentist"]);
      expect((await inbox(`${secret.slice(1)}t`, ALICE.subject)).status).toBe(401);
      expect((await inbox(secret, `${ALICE.subject}|other`)).status).toBe(401);
    } finally {
      vi.unstubAllEnvs();
    }
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

  test("a habit can be renamed, retargeted and archived, and archiving can be undone", async () => {
    const { alice, today } = await setup();
    const id = await alice.mutation(api.organize.addHabit, { title: "Raed 20 min", target: 4 });
    await alice.mutation(api.organize.checkHabit, { id, done: true });
    await alice.mutation(api.organize.updateHabit, { id, title: "Read 20 min", target: 5 });
    expect((await alice.query(api.views.today, { today })).habits.map((h) => [h.title, h.target])).toEqual([
      ["Read 20 min", 5],
    ]);
    await alice.mutation(api.organize.updateHabit, { id, archived: true });
    expect((await alice.query(api.views.today, { today })).habits).toEqual([]);
    expect((await alice.query(api.views.progress, { today })).habits).toEqual([]);
    // Undo brings it back with its history.
    await alice.mutation(api.organize.updateHabit, { id, archived: false });
    const back = await alice.query(api.views.today, { today });
    expect(back.habits.map((h) => [h.title, h.doneToday])).toEqual([["Read 20 min", true]]);
  });

  test("time done counts towards the week and its space", async () => {
    const { alice, today } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Deep work today 10am for 2h #work" });
    await alice.mutation(api.tasks.complete, { id });
    const progress = await alice.query(api.views.progress, { today });
    expect(progress.weekMinutes).toBe(120);
    expect(progress.bySpace.map((s) => [s.name, s.minutes])).toEqual([["Work", 120]]);
  });

  test("a goal made today with a head start shows no pace until it has run a while", async () => {
    const { t, alice, today } = await setup();
    const id = await alice.mutation(api.organize.addGoal, {
      title: "Run 100 km",
      kind: "number",
      target: 100,
      unit: "km",
      dueDate: "2027-01-20",
    });
    await alice.mutation(api.organize.updateGoal, { id, current: 42 });
    const fresh = (await alice.query(api.views.progress, { today })).goals[0];
    expect(fresh?.pace).toBeNull();
    // A month in, the pace is 30 of its 129 days.
    await t.run((ctx) => ctx.db.patch(id, { startDate: "2026-09-13" }));
    const later = (await alice.query(api.views.progress, { today })).goals[0];
    expect(later?.pace).toBeCloseTo(30 / 129);
  });

  test("a task done without a length counts as done, never as invented minutes", async () => {
    const { alice, today } = await setup();
    const timed = await alice.mutation(api.tasks.addText, { text: "Deep work today 10am for 2h #work" });
    const untimed = await alice.mutation(api.tasks.addText, { text: "Book the dentist today #life" });
    await alice.mutation(api.tasks.complete, { id: timed });
    await alice.mutation(api.tasks.complete, { id: untimed });
    const progress = await alice.query(api.views.progress, { today });
    expect(progress.weekMinutes).toBe(120);
    expect(progress.weekDone).toBe(2);
    expect(progress.yearMinutes).toBe(120);
    expect(progress.yearDone).toBe(2);
    expect(progress.bySpace.map((s) => [s.name, s.minutes])).toEqual([["Work", 120]]);
    expect(progress.heat.find((d) => d.date === today)).toEqual({ date: today, minutes: 120, done: 2 });
  });
});

describe("editing a repeat", () => {
  test("saving the same rule again keeps the series where it was", async () => {
    const { alice } = await setup();
    const repeat = {
      freq: "week" as const,
      interval: 1,
      weekdays: [3 as const],
      end: { kind: "count" as const, count: 6 },
    };
    const id = await alice.mutation(api.tasks.add, { title: "Physio", date: "2026-10-01", repeat });
    await alice.mutation(api.tasks.move, { ids: [id], date: "2026-10-16" });
    await alice.mutation(api.tasks.update, { id, repeat: { ...repeat, weekdays: [3] } });
    expect((await alice.query(api.views.task, { id }))?.repeatFirst).toBe("2026-10-01");
    await alice.mutation(api.tasks.update, { id, repeat: { ...repeat, end: { kind: "count", count: 8 } } });
    expect((await alice.query(api.views.task, { id }))?.repeatFirst).toBe("2026-10-16");
  });

  test("null clears reminders and the event switch, as the agent docs say", async () => {
    const { alice } = await setup();
    const id = await alice.mutation(api.tasks.addText, { text: "Standup today 9:30 remind 10m before" });
    await alice.mutation(api.tasks.update, { id, event: true });
    await alice.mutation(api.tasks.update, { id, reminders: null, event: null });
    expect(await alice.query(api.views.task, { id })).toMatchObject({ reminders: [], event: false });
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

describe("limits", () => {
  test("default reminders get the same checks as a task's own", async () => {
    const { alice } = await setup();
    const eleven = Array.from({ length: 11 }, (_, i) => ({ kind: "before" as const, minutes: i }));
    await expect(alice.mutation(api.account.updateProfile, { defaultReminders: eleven })).rejects.toThrow(
      "A task can have up to 10 reminders.",
    );
    await expect(
      alice.mutation(api.account.updateProfile, { defaultReminders: [{ kind: "before", minutes: -5 }] }),
    ).rejects.toThrow("A reminder can be from 0 minutes to 30 days before.");
  });

  test("deleting a task cancels every reminder job it has, past the first 50", async () => {
    const { t, alice } = await setup();
    const id = await alice.mutation(api.tasks.add, { title: "Old data", date: "2026-10-20", time: 600 });
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        const fireAt = Date.parse("2026-10-20T09:00:00Z") + i * 60_000;
        const jobId = await ctx.scheduler.runAt(fireAt, internal.reminders.fire, { taskId: id, fireAt });
        await ctx.db.insert("reminderJobs", { ownerId: ALICE.tokenIdentifier, taskId: id, fireAt, jobId });
      }
    });
    await alice.mutation(api.tasks.remove, { id });
    const left = await t.run(async (ctx) => ({
      rows: (await ctx.db.query("reminderJobs").collect()).length,
      pending: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (f) => f.state.kind === "pending",
      ).length,
    }));
    expect(left).toEqual({ rows: 0, pending: 0 });
  });

  test("space notes stop at 50,000 characters, like task notes", async () => {
    const { alice } = await setup();
    const id = await alice.mutation(api.organize.addSpace, { name: "Work" });
    await expect(alice.mutation(api.organize.updateSpace, { id, note: "x".repeat(50_001) })).rejects.toThrow(
      "Notes can be up to 50,000 characters.",
    );
  });

  test("a phone registers once per account, and signing out takes it back", async () => {
    const { t, alice } = await setup();
    await expect(
      alice.mutation(api.account.registerPush, { token: "not a token", platform: "android" }),
    ).rejects.toThrow("That isn't a push token from this app.");
    for (let i = 0; i < 21; i++)
      await alice.mutation(api.account.registerPush, {
        token: `ExponentPushToken[phone${i}]`,
        platform: "android",
      });
    const tokens = () =>
      t.run(async (ctx) => (await ctx.db.query("pushTokens").collect()).map((r) => r.token));
    expect((await tokens()).length).toBe(20);
    expect(await tokens()).not.toContain("ExponentPushToken[phone0]");
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.unregisterPush, { token: "ExponentPushToken[phone5]" });
    expect(await tokens()).toContain("ExponentPushToken[phone5]");
    await alice.mutation(api.account.unregisterPush, { token: "ExponentPushToken[phone5]" });
    expect(await tokens()).not.toContain("ExponentPushToken[phone5]");
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
    await alice.mutation(api.tasks.logFocus, { taskId: id, minutes: 25, date: "2026-10-13" });
    await alice.mutation(api.assistant.send, { text: "Plan my week around the exam" });
    await t.mutation(internal.agent.add_task, {
      ownerId: ALICE.tokenIdentifier,
      agent: "Codex",
      title: "Read",
    });
    await alice.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}alice`, ...KEYS });
    await bob.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}bob`, ...KEYS });
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
            "focusSessions",
            "agentActions",
            "asks",
            "webPushSubscriptions",
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
    expect((await alice.query(api.views.inbox, { today: "2026-10-13" })).tasks.map((x) => x.title)).toEqual([
      "New idea",
    ]);
    expect(
      (await alice.query(api.views.week, { start: "2026-10-12", today })).inbox.map((x) => x.title),
    ).toEqual(["New idea"]);
  });

  test("an open task from yesterday stays in From earlier after 500 older done ones", async () => {
    const { t, alice } = await setup();
    await history(t, 520, { date: "2026-01-05" });
    await alice.mutation(api.tasks.add, { title: "Problem set 3", date: "2026-10-12" });
    expect((await alice.query(api.views.today, { today: "2026-10-13" })).earlier.map((x) => x.title)).toEqual(
      ["Problem set 3"],
    );
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

describe("a space's page", () => {
  test("a parent space lists and counts what the spaces inside it hold", async () => {
    const { alice, today } = await setup();
    const work = await alice.mutation(api.organize.addSpace, { name: "Work" });
    const kriyan = await alice.mutation(api.organize.addSpace, { name: "Kriyan", parentId: work });
    const launch = await alice.mutation(api.organize.addSpace, { name: "Launch", parentId: kriyan });
    const clients = await alice.mutation(api.organize.addSpace, { name: "Clients", parentId: work });
    await alice.mutation(api.tasks.add, {
      title: "Write MCP tools",
      spaceId: kriyan,
      date: today,
      time: 600,
    });
    await alice.mutation(api.tasks.add, { title: "Draft the post", spaceId: launch, date: "2026-10-15" });
    await alice.mutation(api.tasks.add, { title: "Invoice Acme", spaceId: clients });
    const done = await alice.mutation(api.tasks.add, { title: "Fix login", spaceId: kriyan, date: today });
    await alice.mutation(api.tasks.complete, { id: done });
    // Someone else's space with the same shape stays out of it.
    const bob = alice.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    const bobs = await bob.mutation(api.organize.addSpace, { name: "Work" });
    await bob.mutation(api.tasks.add, { title: "Bob's task", spaceId: bobs, date: today });

    const page = await alice.query(api.views.space, { id: work, today });
    expect(page.next.map((x) => [x.title, x.spacePath])).toEqual([
      ["Write MCP tools", "Work / Kriyan"],
      ["Draft the post", "Work / Kriyan / Launch"],
    ]);
    expect(page.later.map((x) => [x.title, x.spacePath])).toEqual([["Invoice Acme", "Work / Clients"]]);
    expect(page.stats.open).toBe(3);
    expect(page.stats.doneThisMonth).toBe(1);
    expect(page.children.map((c) => [c.name, c.open])).toEqual([
      ["Kriyan", 2],
      ["Clients", 1],
    ]);
    // A leaf space shows only its own.
    const leaf = await alice.query(api.views.space, { id: launch, today });
    expect(leaf.next.map((x) => x.title)).toEqual(["Draft the post"]);
    expect(leaf.stats.open).toBe(1);
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
    expect((await alice.query(api.views.inbox, { today: "2026-10-13" })).tasks.map((x) => x.title)).toEqual([
      "Recent idea",
    ]);
  });

  test("recently deleted lists what's in the trash, newest first, and only the person's own", async () => {
    const { t, alice } = await setup();
    const essay = await alice.mutation(api.tasks.addText, { text: "Essay every fri 17:00 #school" });
    vi.setSystemTime(new Date("2026-10-13T12:05:00Z"));
    const idea = await alice.mutation(api.tasks.addText, { text: "Old idea" });
    await alice.mutation(api.tasks.addText, { text: "Kept idea" });
    await alice.mutation(api.tasks.remove, { id: essay });
    vi.setSystemTime(new Date("2026-10-13T12:10:00Z"));
    await alice.mutation(api.tasks.remove, { id: idea });
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    await bob.mutation(api.tasks.remove, { id: await bob.mutation(api.tasks.addText, { text: "Bob's" }) });

    expect(await alice.query(api.views.trash, {})).toEqual([
      expect.objectContaining({ title: "Old idea", date: null, repeatText: null, spacePath: null }),
      expect.objectContaining({
        title: "Essay",
        date: "2026-10-16",
        time: 1020,
        repeatText: "Every Fri",
        spacePath: "School",
        deletedAt: Date.parse("2026-10-13T12:05:00Z"),
      }),
    ]);
    // Restoring takes it out of the trash and puts it back on its day.
    await alice.mutation(api.tasks.restore, { id: essay });
    expect((await alice.query(api.views.trash, {})).map((x) => x.title)).toEqual(["Old idea"]);
    const week = await alice.query(api.views.week, { start: "2026-10-12", today: "2026-10-13" });
    expect(week.days.find((d) => d.date === "2026-10-16")?.scheduled.map((x) => x.title)).toEqual(["Essay"]);
  });
});

describe("what agents did", () => {
  async function withToken(name = "Codex") {
    const ctx = await setup();
    const { token } = await ctx.alice.mutation(api.account.createToken, { name });
    const call = async (op: string, body: unknown) => {
      const res = await ctx.t.fetch(`/api/v1/${op}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as { result?: any; error?: string } };
    };
    return { ...ctx, call };
  }

  test("each change is listed under the token's name, newest first, and the task says who added it", async () => {
    const { alice, call, today } = await withToken();
    const added = await call("add_task", { text: "Read chapter 4 tomorrow 9am" });
    const taskId = added.body.result.taskId;
    await call("update_task", { taskId, title: "Read chapter 4 and 5" });
    await call("move_tasks", { taskIds: [taskId], date: "2026-10-15" });
    const actions = await alice.query(api.assistant.activity, { today, days: 1 });
    expect(actions.map((a) => [a.agent, a.kind, a.title])).toEqual([
      ["Codex", "move", "Read chapter 4 and 5"],
      ["Codex", "change", "Read chapter 4"],
      ["Codex", "add", "Read chapter 4"],
    ]);
    const task = await alice.query(api.views.task, { id: taskId });
    expect(task?.addedBy).toBe("Codex");
  });

  test("a name the agent gives wins over the token's", async () => {
    const { alice, call, today } = await withToken("Laptop");
    await call("add_task", { title: "Water plants", agent: "Claude" });
    const [action] = await alice.query(api.assistant.activity, { today, days: 1 });
    expect(action?.agent).toBe("Claude");
  });

  test("Undo puts back exactly what each change overwrote, and a second Undo does nothing", async () => {
    const { alice, call, today } = await withToken();
    const { taskId } = (await call("add_task", { text: "Lab report fri 14:00 #uni" })).body.result;
    await call("update_task", { taskId, time: 600, note: "Bring data" });
    const [change] = await alice.query(api.assistant.activity, { today, days: 1 });
    await alice.mutation(api.assistant.undoAction, { id: change!._id });
    await alice.mutation(api.assistant.undoAction, { id: change!._id });
    const task = await alice.query(api.views.task, { id: taskId });
    expect([task?.time, task?.note, task?.date]).toEqual([840, undefined, "2026-10-16"]);
    const after = await alice.query(api.assistant.activity, { today, days: 1 });
    expect(after.map((a) => [a.kind, a.undone, a.undoable])).toEqual([
      ["change", true, false],
      ["add", false, true],
    ]);
    // Undoing the add takes the task away.
    await alice.mutation(api.assistant.undoAction, { id: after[1]!._id });
    expect(await alice.query(api.views.task, { id: taskId })).toBeNull();
  });

  test("undoing an agent's tick puts the task back on its day", async () => {
    const { alice, call, today } = await withToken();
    const { taskId } = (await call("add_task", { text: "Pay rent today" })).body.result;
    await call("complete_task", { taskId });
    const [tick] = await alice.query(api.assistant.activity, { today, days: 1 });
    expect(tick?.kind).toBe("done");
    await alice.mutation(api.assistant.undoAction, { id: tick!._id });
    const day = await alice.query(api.views.today, { today });
    expect(day.anytime.map((t) => [t.title, t.done])).toEqual([["Pay rent", false]]);
  });

  test("nobody else can see or undo the person's activity", async () => {
    const { t, call, today } = await withToken();
    await call("add_task", { title: "Secret" });
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    expect(await bob.query(api.assistant.activity, { today, days: 1 })).toEqual([]);
    const [mine] = await t.withIdentity(ALICE).query(api.assistant.activity, { today, days: 1 });
    await expect(bob.mutation(api.assistant.undoAction, { id: mine!._id })).rejects.toThrow(/isn't yours/);
  });
});

describe("the Ask tab", () => {
  test("what Kriyan understands is done at once, answered as Kriyan, and can be undone", async () => {
    const { alice, today } = await setup();
    await alice.mutation(api.assistant.send, { text: "Add call mum tomorrow 18:00" });
    let [ask] = await alice.query(api.assistant.asks, {});
    expect([ask?.agent, ask?.reply, ask?.undoable]).toEqual([
      "Kriyan",
      'Added "call mum" to tomorrow at 18:00.',
      true,
    ]);
    await alice.mutation(api.assistant.undoAsk, { id: ask!._id });
    [ask] = await alice.query(api.assistant.asks, {});
    expect([ask?.undoable, ask?.undone]).toEqual([false, true]);
    const week = await alice.query(api.views.week, { start: today, today });
    expect(week.days.flatMap((d) => [...d.scheduled, ...d.anytime].map((t) => t.title))).toEqual([]);
  });

  test("moving what's left to tomorrow says what moved", async () => {
    const { alice } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Essay today" });
    await alice.mutation(api.tasks.addText, { text: "Gym today 18:00" });
    await alice.mutation(api.assistant.send, { text: "Move everything left to tomorrow" });
    const [ask] = await alice.query(api.assistant.asks, {});
    expect(ask?.reply).toBe('Moved 2 to tomorrow: "Essay" and "Gym".');
  });

  test("free time counts what's planned between now and the end of the day", async () => {
    const { alice } = await setup();
    // 12:00 now; the day ends at 22:00 by default.
    await alice.mutation(api.tasks.addText, { text: "Lab today 14:00 for 2h" });
    await alice.mutation(api.assistant.send, { text: "How much free time do I have?" });
    const [ask] = await alice.query(api.assistant.asks, {});
    expect(ask?.reply).toBe("8h free until 22:00. The longest stretch is 16:00 to 22:00.");
  });

  test("anything else waits for an agent, which reads it, acts and replies with its changes listed", async () => {
    const { t, alice } = await setup();
    const { token } = await alice.mutation(api.account.createToken, { name: "Mac mini" });
    const call = async (op: string, body: unknown) =>
      (await (
        await t.fetch(`/api/v1/${op}`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).json()) as { result?: any; error?: string };
    await alice.mutation(api.assistant.send, { text: "Plan my study for the exam on Friday" });
    const waiting = (await call("get_asks", {})).result;
    expect(waiting.map((w: { text: string }) => w.text)).toEqual(["Plan my study for the exam on Friday"]);
    vi.advanceTimersByTime(1000);
    await call("add_task", { title: "Revise chapter 1", date: "2026-10-14", time: 600, agent: "Claude" });
    vi.advanceTimersByTime(1000);
    await call("answer_ask", {
      askId: waiting[0].askId,
      reply: "Added a revision block tomorrow at 10:00.",
      agent: "Claude",
    });
    const [ask] = await alice.query(api.assistant.asks, {});
    expect([ask?.agent, ask?.reply, ask?.changes.map((c) => [c.kind, c.title])]).toEqual([
      "Claude",
      "Added a revision block tomorrow at 10:00.",
      [["add", "Revise chapter 1"]],
    ]);
    expect((await call("get_asks", {})).result).toEqual([]);
  });

  test("an agent can't answer for Kriyan or for someone else", async () => {
    const { t, alice } = await setup();
    const own = await alice.mutation(api.assistant.send, { text: "What's next?" });
    await expect(
      t.mutation(internal.agent.answer_ask, {
        ownerId: ALICE.tokenIdentifier,
        agent: "X",
        askId: own,
        reply: "Hi",
      }),
    ).rejects.toThrow(/already answered/);
    const waiting = await alice.mutation(api.assistant.send, { text: "Plan my week" });
    await expect(
      t.mutation(internal.agent.answer_ask, {
        ownerId: BOB.tokenIdentifier,
        agent: "X",
        askId: waiting,
        reply: "Hi",
      }),
    ).rejects.toThrow(/isn't yours/);
  });
});

describe("focus, steps and settings", () => {
  test("focus sessions add up for today, the week and each goal", async () => {
    const { alice, today } = await setup();
    const goal = await alice.mutation(api.organize.addGoal, {
      title: "Distinction",
      kind: "tasks",
      target: 10,
    });
    const id = await alice.mutation(api.tasks.add, { title: "Revise", goalId: goal, date: today });
    await alice.mutation(api.tasks.logFocus, { taskId: id, minutes: 25.4, date: today });
    await alice.mutation(api.tasks.logFocus, { minutes: 40, date: "2026-10-12" });
    // Under a minute isn't a session.
    expect(await alice.mutation(api.tasks.logFocus, { minutes: 0.4, date: today })).toBeNull();
    const focus = await alice.query(api.views.focus, { today });
    expect([focus.today, focus.week, focus.byGoal]).toEqual([25, 65, [{ goalId: goal, minutes: 25 }]]);
    expect(focus.byDay.map((d) => d.minutes)).toEqual([40, 25, 0, 0, 0, 0, 0]);
  });

  test("a task's screen reads every minute focused on it, across days, and nobody else's", async () => {
    const { t, alice, today } = await setup();
    const id = await alice.mutation(api.tasks.add, { title: "Lab report", date: today, length: 90 });
    const other = await alice.mutation(api.tasks.add, { title: "Something else", date: today });
    expect((await alice.query(api.views.task, { id }))?.tracked).toBe(0);
    await alice.mutation(api.tasks.logFocus, { taskId: id, minutes: 15, date: "2026-10-12" });
    await alice.mutation(api.tasks.logFocus, { taskId: id, minutes: 10, date: today });
    await alice.mutation(api.tasks.logFocus, { taskId: other, minutes: 40, date: today });
    await alice.mutation(api.tasks.logFocus, { minutes: 30, date: today });
    expect((await alice.query(api.views.task, { id }))?.tracked).toBe(25);
    expect((await alice.query(api.views.task, { id: other }))?.tracked).toBe(40);
    // Bob can't read Alice's task, so he can't read its time either.
    expect(await t.withIdentity(BOB).query(api.views.task, { id })).toBeNull();
  });

  test("steps are saved in order, checked, and cleared with null", async () => {
    const { alice } = await setup();
    const id = await alice.mutation(api.tasks.add, {
      title: "Essay",
      steps: [
        { title: " Outline ", done: true },
        { title: "Draft", done: false },
      ],
    });
    expect((await alice.query(api.views.task, { id }))?.steps).toEqual([
      { title: "Outline", done: true },
      { title: "Draft", done: false },
    ]);
    await expect(
      alice.mutation(api.tasks.update, { id, steps: [{ title: "  ", done: false }] }),
    ).rejects.toThrow(/each step a title/);
    await alice.mutation(api.tasks.update, { id, steps: null });
    expect((await alice.query(api.views.task, { id }))?.steps).toBeUndefined();
  });

  test("Today's rows carry their steps and the agent that added them", async () => {
    const { t, alice, today } = await setup();
    await alice.mutation(api.tasks.add, {
      title: "Essay",
      date: today,
      steps: [
        { title: "Outline", done: true },
        { title: "Draft", done: false },
      ],
    });
    await t.mutation(internal.agent.add_task, {
      ownerId: ALICE.tokenIdentifier,
      agent: "Codex",
      title: "Reply to Dr. Okafor",
      date: today,
    });
    const day = await alice.query(api.views.today, { today });
    expect(
      day.anytime.map((t) => [t.title, t.steps.length, t.steps.filter((s) => s.done).length, t.addedBy]),
    ).toEqual([
      ["Essay", 2, 1, null],
      ["Reply to Dr. Okafor", 0, 0, "Codex"],
    ]);
  });

  test("review time, sounds and the semester are saved and checked", async () => {
    const { alice } = await setup();
    await alice.mutation(api.account.updateProfile, {
      reviewTime: 21 * 60,
      sounds: true,
      semesterStart: "2026-08-17",
      semesterEnd: "2026-11-20",
    });
    const p = await alice.query(api.account.profile, {});
    expect([p.reviewTime, p.sounds, p.semesterStart, p.semesterEnd]).toEqual([
      1260,
      true,
      "2026-08-17",
      "2026-11-20",
    ]);
    await expect(alice.mutation(api.account.updateProfile, { semesterEnd: "2026-08-01" })).rejects.toThrow(
      /end after it starts/,
    );
    await alice.mutation(api.account.updateProfile, { semesterStart: null, semesterEnd: null });
    const cleared = await alice.query(api.account.profile, {});
    expect([cleared.semesterStart, cleared.semesterEnd]).toEqual([undefined, undefined]);
  });
});

// Shaped like a real browser's subscription: an FCM endpoint, a 65-byte key and a 16-byte secret.
const PUSH_SERVICE = "https://fcm.googleapis.com/fcm/send/";
const KEYS = {
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
const NEW_KEYS = {
  p256dh: "BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo4M0gs0i1oEKgPpWC5cW8OCzVrOQRv-1npXRWk8udnW3oYhIO4475rds",
  auth: "5I2Bu2oKdyy9CwL8QVF0NQ",
};
const VAPID = {
  VAPID_PUBLIC_KEY: "BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YeZJsiApwXKpNcF1rRPF3foIiBHXRdJI2Qhumhf6_LFTeZaNndIo",
  VAPID_PRIVATE_KEY: "xKZKYRNdFFn8iQIF2MH54KTfUHwH105zBdzMR7SI3xI",
  VAPID_SUBJECT: "mailto:test@kriyan.app",
};

describe("reminders in the browser", () => {
  beforeEach(() => {
    webPushMock.setVapidDetails.mockReset();
    webPushMock.sendNotification.mockReset();
    webPushMock.sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  });
  afterEach(() => {
    for (const name of Object.keys(VAPID)) delete process.env[name];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const turnOnWebPush = () => Object.assign(process.env, VAPID);

  const subscriptions = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
    t.run(async (ctx) =>
      (await ctx.db.query("webPushSubscriptions").collect()).map((r) => [
        r.ownerId,
        r.endpoint,
        r.p256dh,
        r.auth,
      ]),
    );

  test("a browser subscribes once, and subscribing again replaces its keys", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}laptop`, ...KEYS });
    expect(await subscriptions(t)).toEqual([
      [ALICE.tokenIdentifier, `${PUSH_SERVICE}laptop`, KEYS.p256dh, KEYS.auth],
    ]);
    await alice.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}laptop`, ...NEW_KEYS });
    expect(await subscriptions(t)).toEqual([
      [ALICE.tokenIdentifier, `${PUSH_SERVICE}laptop`, NEW_KEYS.p256dh, NEW_KEYS.auth],
    ]);
    await alice.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}phone`, ...KEYS });
    expect(await subscriptions(t)).toEqual([
      [ALICE.tokenIdentifier, `${PUSH_SERVICE}laptop`, NEW_KEYS.p256dh, NEW_KEYS.auth],
      [ALICE.tokenIdentifier, `${PUSH_SERVICE}phone`, KEYS.p256dh, KEYS.auth],
    ]);
  });

  test("only an https push address with real-looking keys is stored", async () => {
    const { t, alice } = await setup();
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/laptop",
      "not a url",
      `${PUSH_SERVICE}${"a".repeat(1000)}`,
    ])
      await expect(alice.mutation(api.account.registerWebPush, { endpoint, ...KEYS })).rejects.toThrow(
        "That isn't a push address from a browser.",
      );
    for (const keys of [
      { p256dh: "short", auth: KEYS.auth },
      { p256dh: KEYS.p256dh, auth: "not base64url!" },
    ])
      await expect(
        alice.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}laptop`, ...keys }),
      ).rejects.toThrow("That browser's push keys don't look right.");
    expect(await subscriptions(t)).toEqual([]);
  });

  test("the 21st browser drops the oldest", async () => {
    const { t, alice } = await setup();
    // Named so the oldest sorts last by endpoint: the cap must go by age, not by address.
    for (let i = 0; i < 21; i++)
      await alice.mutation(api.account.registerWebPush, {
        endpoint: `${PUSH_SERVICE}${String(20 - i).padStart(2, "0")}`,
        ...KEYS,
      });
    const endpoints = (await subscriptions(t)).map((row) => row[1]);
    expect(endpoints.length).toBe(20);
    expect(endpoints).not.toContain(`${PUSH_SERVICE}20`);
    expect(endpoints).toContain(`${PUSH_SERVICE}00`);
  });

  test("signing out takes back only your own browser", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}laptop`, ...KEYS });
    await t.withIdentity(BOB).mutation(api.account.unregisterWebPush, { endpoint: `${PUSH_SERVICE}laptop` });
    expect(await subscriptions(t)).toEqual([
      [ALICE.tokenIdentifier, `${PUSH_SERVICE}laptop`, KEYS.p256dh, KEYS.auth],
    ]);
    await alice.mutation(api.account.unregisterWebPush, { endpoint: `${PUSH_SERVICE}laptop` });
    expect(await subscriptions(t)).toEqual([]);
  });

  test("the app learns the public key only when all three VAPID settings are there", async () => {
    const { alice } = await setup();
    expect(await alice.query(api.account.webPushKey, {})).toBeNull();
    process.env.VAPID_PUBLIC_KEY = VAPID.VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = VAPID.VAPID_PRIVATE_KEY;
    expect(await alice.query(api.account.webPushKey, {})).toBeNull();
    turnOnWebPush();
    expect(await alice.query(api.account.webPushKey, {})).toBe(VAPID.VAPID_PUBLIC_KEY);
  });

  async function remindDentist() {
    const ctx = await setup();
    await ctx.alice.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}laptop`, ...KEYS });
    const id = await ctx.alice.mutation(api.tasks.addText, {
      text: "Dentist tomorrow 9am remind day before at 20:00",
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    return { ...ctx, id, fetch, fireAt: Date.parse("2026-10-13T20:00:00Z") };
  }
  async function ring(t: Awaited<ReturnType<typeof setup>>["t"]) {
    vi.advanceTimersToNextTimer();
    await t.finishInProgressScheduledFunctions();
  }

  test("a browser with no phone gets the reminder, with the task and when it is", async () => {
    turnOnWebPush();
    const { t, id, fetch, fireAt } = await remindDentist();
    await ring(t);
    expect(webPushMock.setVapidDetails.mock.calls).toEqual([
      [VAPID.VAPID_SUBJECT, VAPID.VAPID_PUBLIC_KEY, VAPID.VAPID_PRIVATE_KEY],
    ]);
    expect(webPushMock.sendNotification.mock.calls).toEqual([
      [
        { endpoint: `${PUSH_SERVICE}laptop`, keys: KEYS },
        JSON.stringify({ title: "Dentist", body: "Tomorrow at 09:00", taskId: id, tag: `${id}:${fireAt}` }),
        { TTL: 14400, urgency: "high" },
      ],
    ]);
    // No phone is registered, so Expo is never called.
    expect(fetch).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("reminderJobs").collect())).toEqual([]);
  });

  test("a browser the push service says is gone is forgotten; one that failed for now is kept", async () => {
    turnOnWebPush();
    const { t, alice } = await remindDentist();
    await alice.mutation(api.account.registerWebPush, { endpoint: `${PUSH_SERVICE}phone`, ...NEW_KEYS });
    webPushMock.sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      throw Object.assign(new Error("push failed"), {
        statusCode: sub.endpoint.endsWith("laptop") ? 410 : 500,
      });
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await ring(t);
    expect(webPushMock.sendNotification).toHaveBeenCalledTimes(2);
    expect(await subscriptions(t)).toEqual([
      [ALICE.tokenIdentifier, `${PUSH_SERVICE}phone`, NEW_KEYS.p256dh, NEW_KEYS.auth],
    ]);
    expect(logged.mock.calls).toEqual([["Web push failed with 500"]]);
  });

  test("without VAPID settings nothing is sent and the reminder is still done with", async () => {
    const { t } = await remindDentist();
    await ring(t);
    expect(webPushMock.sendNotification).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("reminderJobs").collect())).toEqual([]);
    expect((await subscriptions(t)).length).toBe(1);
  });
});

describe("links", () => {
  test("a task link with a mistyped id reads as not found", async () => {
    const { alice } = await setup();
    expect(await alice.query(api.views.task, { id: "not-a-task-id" })).toBeNull();
  });
});

describe("agents working in bulk", () => {
  // A student's agent syncing coursework: it calls the API with a token, as MCP and the CLI do.
  async function withToken(name = "Chitti school") {
    const ctx = await setup();
    const { token } = await ctx.alice.mutation(api.account.createToken, { name });
    const call = async (op: string, body: unknown = {}) => {
      const res = await ctx.t.fetch(`/api/v1/${op}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as { result?: any; error?: string } };
    };
    const ok = async (op: string, body: unknown = {}) => {
      const reply = await call(op, body);
      if (reply.status !== 200) throw new Error(`${op}: ${reply.status} ${reply.body.error}`);
      return reply.body.result;
    };
    return { ...ctx, call, ok };
  }

  test("a due time is saved apart from the title, reads back, and leaves with its deadline", async () => {
    const { alice, ok, call, today } = await withToken();
    const { taskId, task } = await ok("add_task", { text: "Workshop 8 coding due fri 11:55 PM #cs" });
    expect([task.title, task.deadline, task.dueTime, task.date, task.time]).toEqual([
      "Workshop 8 coding",
      "2026-10-16",
      1435,
      null,
      null,
    ]);
    const week = await alice.query(api.views.week, { start: "2026-10-12", today });
    expect(week.days[4]!.deadlines.map((t) => [t.title, t.dueTime])).toEqual([["Workshop 8 coding", 1435]]);

    const fields = await ok("add_task", { title: "Quiz 3", deadline: "2026-10-15", dueTime: 600 });
    expect([fields.task.deadline, fields.task.dueTime]).toEqual(["2026-10-15", 600]);
    expect(await call("add_task", { title: "Reading", dueTime: 600 })).toEqual({
      status: 400,
      body: { error: "A due time needs a deadline: send the deadline with it." },
    });

    const cleared = await ok("update_task", { taskId, deadline: null });
    expect([cleared.task.deadline, cleared.task.dueTime]).toEqual([null, null]);
    // Undo puts back both, since clearing the deadline took the time with it.
    const [change] = await alice.query(api.assistant.activity, { today, days: 1 });
    await alice.mutation(api.assistant.undoAction, { id: change!._id });
    const back = await ok("get_task", { taskId });
    expect([back.deadline, back.dueTime]).toEqual(["2026-10-16", 1435]);
  });

  test("add_tasks adds what it can in one call and says why the others were refused", async () => {
    const { ok, alice, today } = await withToken();
    const reply = await ok("add_tasks", {
      tasks: [
        { title: "Workshop 8 coding", deadline: "2026-10-16", dueTime: 1435 },
        { title: "Lab 4", date: "2026-13-40" },
        { title: "Essay plan", spaceId: "not-a-space" },
        { text: "Read chapter 5 today" },
      ],
    });
    expect([reply.added, reply.failed]).toEqual([2, 2]);
    expect(
      reply.results.map((r: any) => (r.ok ? [r.index, r.task.title, r.task.status] : [r.index, r.error])),
    ).toEqual([
      [0, "Workshop 8 coding", "open"],
      [1, "The date must be a date like 2026-10-13."],
      [2, "That space doesn't exist or isn't yours."],
      [3, "Read chapter 5", "open"],
    ]);
    expect((await alice.query(api.views.today, { today })).anytime.map((t) => t.title)).toEqual([
      "Read chapter 5",
    ]);
    const actions = await alice.query(api.assistant.activity, { today, days: 1 });
    expect(actions.map((a) => [a.agent, a.kind, a.title])).toEqual([
      ["Chitti school", "add", "Read chapter 5"],
      ["Chitti school", "add", "Workshop 8 coding"],
    ]);
  });

  test("update, complete, delete and restore take many tasks, each answered in place", async () => {
    const { ok } = await withToken();
    const { results } = await ok("add_tasks", {
      tasks: [{ text: "Lab report today" }, { text: "Problem set today" }, { text: "Gym every mon 7am" }],
    });
    const [lab, set, gym] = results.map((r: any) => r.task.taskId as string);

    const updated = await ok("update_tasks", {
      updates: [
        { taskId: lab, deadline: "2026-10-16", dueTime: 1020 },
        { taskId: set, time: 2000 },
        { taskId: "nope", title: "x" },
      ],
    });
    expect([updated.updated, updated.failed]).toEqual([1, 2]);
    expect(updated.results.map((r: any) => (r.ok ? [r.task.deadline, r.task.dueTime] : r.error))).toEqual([
      ["2026-10-16", 1020],
      "The time must be within the day.",
      "That task doesn't exist or isn't yours.",
    ]);

    const done = await ok("complete_tasks", {
      tasks: [{ taskId: lab, date: "2026-10-13" }, { taskId: gym, date: "2026-10-19" }, { taskId: set }],
    });
    expect(done.results.map((r: any) => (r.ok ? [r.taskId, r.finished, r.next] : r.error))).toEqual([
      [lab, true, null],
      [gym, false, "2026-10-26"],
      [set, true, null],
    ]);
    expect([done.completed, done.failed]).toEqual([3, 0]);
    // A retried call is refused per item instead of ticking the gym's next week too.
    const retry = await ok("complete_tasks", { tasks: [{ taskId: gym, date: "2026-10-19" }] });
    expect(retry.results).toEqual([
      { index: 0, ok: false, error: "That task is on Mon 26 Oct now, so it wasn't ticked off again." },
    ]);

    const deleted = await ok("delete_tasks", { taskIds: [lab, gym] });
    expect([deleted.deleted, deleted.failed]).toEqual([2, 0]);
    expect((await ok("search_tasks", { status: "deleted" })).tasks.map((t: any) => t.taskId).sort()).toEqual(
      [lab, gym].sort(),
    );
    const restored = await ok("restore_tasks", { taskIds: [lab, gym] });
    expect(restored.restored).toBe(2);
    expect((await ok("search_tasks", { status: "deleted" })).tasks).toEqual([]);
  });

  test("upsert_tasks syncs by externalId: created, then unchanged, then only what changed", async () => {
    const { ok, call, alice, today } = await withToken();
    const sync = [
      {
        externalId: "moodle:assign:812",
        title: "Workshop 8 coding",
        deadline: "2026-10-30",
        dueTime: 1435,
      },
      {
        externalId: "moodle:class:cs101",
        title: "CS101 lecture",
        date: "2026-10-13",
        time: 600,
        length: 90,
        event: true,
        repeat: { freq: "week", interval: 1, weekdays: [1, 3] },
      },
    ];
    const first = await ok("upsert_tasks", { tasks: sync });
    expect([first.created, first.updated, first.unchanged, first.skipped, first.failed]).toEqual([
      2, 0, 0, 0, 0,
    ]);

    // The class has moved on to Thursday since; the same sync must not move it back or add it again.
    const lecture = first.results[1].task.taskId;
    await ok("complete_task", { taskId: lecture, date: "2026-10-13" });
    const again = await ok("upsert_tasks", {
      tasks: [sync[0], { ...sync[1], repeat: { interval: 1, weekdays: [1, 3], freq: "week" } }],
    });
    expect([again.created, again.updated, again.unchanged]).toEqual([0, 0, 2]);
    expect(again.results.map((r: any) => r.status)).toEqual(["unchanged", "unchanged"]);
    expect((await ok("get_task", { taskId: lecture })).date).toBe("2026-10-15");

    const moved = await ok("upsert_tasks", {
      tasks: [{ ...sync[0], dueTime: 1380, note: null }, sync[1]],
    });
    expect([moved.created, moved.updated, moved.unchanged]).toEqual([0, 1, 1]);
    expect(moved.results[0].task.dueTime).toBe(1380);

    // The person deleted the assignment: the next sync leaves it deleted.
    await ok("delete_task", { taskId: first.results[0].task.taskId });
    const later = await ok("upsert_tasks", { tasks: [sync[0]] });
    expect([later.created, later.skipped, later.results[0].status]).toEqual([0, 1, "skipped"]);

    expect(
      (await call("upsert_tasks", { tasks: [{ externalId: "moodle:new" }] })).body.result.results,
    ).toEqual([{ index: 0, ok: false, error: "A new task needs a title." }]);
    expect(await call("add_task", { title: "Copy", externalId: "moodle:class:cs101" })).toEqual({
      status: 400,
      body: {
        error:
          'Another task already has the externalId "moodle:class:cs101"; upsert_tasks updates it instead.',
      },
    });
    const actions = await alice.query(api.assistant.activity, { today, days: 1 });
    expect(
      actions.filter((a) => a.kind === "add" || a.kind === "change").map((a) => [a.kind, a.title]),
    ).toEqual([
      ["change", "Workshop 8 coding"],
      ["add", "CS101 lecture"],
      ["add", "Workshop 8 coding"],
    ]);
  });

  test("search_tasks finds tasks by words, space, dates, status, kind and agent, a page at a time", async () => {
    const { ok, call, alice } = await withToken();
    const uni = await alice.mutation(api.organize.addSpace, { name: "Uni" });
    const cs = await alice.mutation(api.organize.addSpace, { name: "CS101", parentId: uni });
    await alice.mutation(api.tasks.add, { title: "Groceries", date: "2026-10-14" });
    await ok("add_tasks", {
      tasks: [
        { title: "Workshop 8 coding", spaceId: cs, deadline: "2026-10-30", dueTime: 1435 },
        { title: "Workshop 9 coding", spaceId: cs, deadline: "2026-11-06", note: "Recursion and trees" },
        { title: "Essay draft", spaceId: uni, date: "2026-10-20" },
        { title: "CS101 lecture", spaceId: cs, date: "2026-10-15", time: 600, event: true },
      ],
    });
    const titles = async (filters: object) =>
      (await ok("search_tasks", filters)).tasks.map((t: any) => t.title);

    expect(await titles({ text: "workshop CODING" })).toEqual(["Workshop 9 coding", "Workshop 8 coding"]);
    expect(await titles({ text: "trees" })).toEqual(["Workshop 9 coding"]);
    expect(await titles({ spaceId: uni })).toEqual([
      "CS101 lecture",
      "Essay draft",
      "Workshop 9 coding",
      "Workshop 8 coding",
    ]);
    expect(await titles({ spaceId: uni, includeChildSpaces: false })).toEqual(["Essay draft"]);
    expect(await titles({ deadlineFrom: "2026-10-24", deadlineTo: "2026-10-31" })).toEqual([
      "Workshop 8 coding",
    ]);
    expect(await titles({ dateFrom: "2026-10-14", dateTo: "2026-10-15" })).toEqual([
      "CS101 lecture",
      "Groceries",
    ]);
    expect(await titles({ kind: "event" })).toEqual(["CS101 lecture"]);
    expect(await titles({ addedBy: "chitti SCHOOL", kind: "task" })).toEqual([
      "Essay draft",
      "Workshop 9 coding",
      "Workshop 8 coding",
    ]);

    const [row] = (await ok("search_tasks", { text: "workshop 8" })).tasks;
    expect(row).toEqual({
      taskId: row.taskId,
      title: "Workshop 8 coding",
      status: "open",
      spaceId: cs,
      spacePath: "Uni / CS101",
      date: null,
      time: null,
      length: null,
      deadline: "2026-10-30",
      dueTime: 1435,
      event: false,
      repeatText: null,
      hasNote: false,
      addedBy: "Chitti school",
      proposedBy: null,
      externalId: null,
    });
    await ok("complete_task", { taskId: row.taskId });
    expect(await titles({ status: "done" })).toEqual(["Workshop 8 coding"]);
    expect(await titles({ text: "workshop" })).toEqual(["Workshop 9 coding"]);

    const page1 = await ok("search_tasks", { status: "any", limit: 2 });
    const page2 = await ok("search_tasks", { status: "any", limit: 2, cursor: page1.cursor });
    const page3 = await ok("search_tasks", { status: "any", limit: 2, cursor: page2.cursor });
    expect([page1.tasks, page2.tasks, page3.tasks].map((p) => p.map((t: any) => t.title))).toEqual([
      ["CS101 lecture", "Essay draft"],
      ["Workshop 9 coding", "Workshop 8 coding"],
      ["Groceries"],
    ]);
    expect([typeof page1.cursor, page3.cursor]).toEqual(["string", null]);
    expect((await call("search_tasks", { dateFrom: "next week" })).body).toEqual({
      error: "The dateFrom must be a date like 2026-10-13.",
    });
  });

  test("get_range reads a month with a weekly class on every day it falls, up to 62 days", async () => {
    const { ok, call } = await withToken();
    await ok("add_task", { text: "Calculus every tue and thu 9am for 1h" });
    await ok("add_task", { title: "Essay", deadline: "2026-11-02", dueTime: 1435 });
    const month = await ok("get_range", { start: "2026-10-13", end: "2026-11-12" });
    expect(month.days.length).toBe(31);
    const classes = month.days.filter((d: any) => d.scheduled.length).map((d: any) => d.date);
    expect(classes.length).toBe(10);
    expect(classes.slice(0, 3)).toEqual(["2026-10-13", "2026-10-15", "2026-10-20"]);
    expect(month.days.find((d: any) => d.date === "2026-11-02").deadlines.map((t: any) => t.title)).toEqual([
      "Essay",
    ]);
    expect((await call("get_range", { start: "2026-10-01", end: "2026-12-15" })).body).toEqual({
      error: "Ask for at most 62 days at a time.",
    });
  });

  test("an agent lists its runs and undoes a whole one, like Undo in the app", async () => {
    const { ok, alice, today } = await withToken();
    await ok("add_task", { title: "Call Mum", agent: "Claude" });
    const added = await ok("add_tasks", {
      tasks: [{ title: "Workshop 8" }, { title: "Workshop 9" }, { title: "Quiz 3" }],
    });
    await ok("update_task", { taskId: added.results[0].task.taskId, deadline: "2026-10-16" });

    const { runs } = await ok("list_changes", { by: "chitti school" });
    expect(runs.map((r: any) => [r.agent, r.summary, r.changes.length])).toEqual([
      ["Chitti school", "added 3 and changed 1", 4],
    ]);
    expect(runs[0].changes.map((c: any) => [c.kind, c.title, c.undoable])).toEqual([
      ["add", "Workshop 8", true],
      ["add", "Workshop 9", true],
      ["add", "Quiz 3", true],
      ["change", "Workshop 8", true],
    ]);

    const undone = await ok("undo_changes", { runId: runs[0].runId });
    expect([undone.undone, undone.failed]).toEqual([4, 0]);
    expect((await ok("search_tasks", {})).tasks.map((t: any) => t.title)).toEqual(["Call Mum"]);
    const after = await ok("list_changes", {});
    expect(after.runs.map((r: any) => [r.agent, r.summary])).toEqual([
      ["Chitti school", ""],
      ["Claude", "added 1"],
    ]);
    // Undoing again changes nothing; the app's list shows them undone.
    expect((await ok("undo_changes", { actionIds: [runs[0].changes[1].actionId] })).undone).toBe(1);
    const listed = await alice.query(api.assistant.activity, { today, days: 1 });
    expect(listed.filter((a) => a.undone).length).toBe(4);
  });

  test("a cancelled class is skipped for one week, a retry skips nothing more, and Undo puts it back", async () => {
    const { ok, call, alice, today } = await withToken();
    const { taskId } = await ok("add_task", { text: "CS101 lecture every tue 10am for 1h" });
    expect(await ok("skip_occurrence", { taskId, date: "2026-10-13" })).toEqual({
      taskId,
      skipped: "2026-10-13",
      next: "2026-10-20",
    });
    expect((await call("skip_occurrence", { taskId, date: "2026-10-13" })).body).toEqual({
      error: "That task is on Tue 20 Oct now, so nothing was skipped.",
    });
    const [skip] = await alice.query(api.assistant.activity, { today, days: 1 });
    expect([skip?.kind, skip?.undoable]).toEqual(["move", true]);
    await alice.mutation(api.assistant.undoAction, { id: skip!._id });
    expect((await ok("get_task", { taskId })).date).toBe("2026-10-13");
  });

  test("spaces, habits and goals can be archived and habits changed, saying what stays", async () => {
    const { ok, alice, today } = await withToken();
    const uni = await alice.mutation(api.organize.addSpace, { name: "Uni" });
    await alice.mutation(api.organize.addSpace, { name: "CS101", parentId: uni });
    await ok("add_task", { title: "Essay", spaceId: uni, date: "2026-10-14" });
    expect(await ok("delete_space", { spaceId: uni })).toEqual({
      spaceId: uni,
      archived: true,
      openTasksKept: 1,
      spacesMovedToTop: 1,
    });
    expect((await ok("list_spaces")).map((s: any) => s.path)).toEqual(["CS101"]);
    expect(
      (await ok("search_tasks", { text: "essay" })).tasks.map((t: any) => [t.title, t.spacePath]),
    ).toEqual([["Essay", null]]);

    const { habitId } = await ok("add_habit", { title: "Raed", target: 3 });
    await ok("update_habit", { habitId, title: "Read 20 min", target: 5 });
    expect((await alice.query(api.views.today, { today })).habits.map((h) => [h.title, h.target])).toEqual([
      ["Read 20 min", 5],
    ]);
    await ok("delete_habit", { habitId });
    expect((await alice.query(api.views.today, { today })).habits).toEqual([]);

    const { goalId } = await ok("add_goal", { title: "Run 100 km", kind: "number", target: 100 });
    expect(await ok("delete_goal", { goalId })).toEqual({ goalId, archived: true });
    expect(await alice.query(api.views.goals, { today })).toEqual([]);
  });

  test("an agent reads and changes the day's settings, but not who may edit directly", async () => {
    const { ok, call } = await withToken();
    expect(await ok("get_settings")).toEqual({
      timeZone: "UTC",
      dayStart: 480,
      dayEnd: 1320,
      dailyCapacity: 420,
      defaultReminders: [{ kind: "before", minutes: 10 }],
      reviewTime: 1200,
      agentsEditDirectly: false,
      sounds: false,
      semesterStart: null,
      semesterEnd: null,
      todayLayout: "blocks",
      earlierWindow: "week",
      showSpace: true,
      hideDone: false,
      nowBadge: true,
    });
    const { settings } = await ok("update_settings", {
      dayStart: 420,
      reviewTime: 1290,
      semesterStart: "2026-09-01",
      semesterEnd: "2026-12-18",
    });
    expect([settings.dayStart, settings.reviewTime, settings.semesterEnd]).toEqual([420, 1290, "2026-12-18"]);
    expect((await call("update_settings", { dayStart: 1300, dayEnd: 1200 })).body).toEqual({
      error: "Your day must end after it starts.",
    });
    expect((await call("update_settings", { agentsEditDirectly: true })).status).toBe(400);
  });
});

describe("Today's layout and what's left from earlier", () => {
  test("Today returns the layout choices at their defaults, and the profile update saves them", async () => {
    const { alice, today } = await setup();
    expect((await alice.query(api.views.today, { today })).profile).toEqual({
      timeZone: "UTC",
      dayStart: 480,
      dayEnd: 1320,
      dailyCapacity: 420,
      todayLayout: "blocks",
      earlierWindow: "week",
      showSpace: true,
      hideDone: false,
      nowBadge: true,
      reviewTime: 1200,
    });
    await alice.mutation(api.account.updateProfile, {
      todayLayout: "list",
      earlierWindow: "month",
      showSpace: false,
      hideDone: true,
      nowBadge: false,
    });
    const p = (await alice.query(api.views.today, { today })).profile;
    expect([p.todayLayout, p.earlierWindow, p.showSpace, p.hideDone, p.nowBadge]).toEqual([
      "list",
      "month",
      false,
      true,
      false,
    ]);
  });

  test("earlier keeps a week by default with how old each is; older ones wait in the Inbox", async () => {
    const { alice } = await setup();
    const today = "2026-10-13";
    await alice.mutation(api.tasks.add, { title: "Problem set 3", date: "2026-10-12" });
    await alice.mutation(api.tasks.add, { title: "Workshop 7 coding", deadline: "2026-10-06" });
    await alice.mutation(api.tasks.add, { title: "Submit advising form", date: "2026-10-05" });
    await alice.mutation(api.tasks.add, { title: "Return the library book", deadline: "2026-09-01" });
    await alice.mutation(api.tasks.add, { title: "Look into internships" });
    const earlier = async () =>
      (await alice.query(api.views.today, { today })).earlier.map((t) => [t.title, t.ageDays]);
    const older = async () => {
      const inbox = await alice.query(api.views.inbox, { today });
      // Captured in the same instant (the clock is frozen), so their order is a tie.
      return {
        tasks: inbox.tasks.map((t) => t.title).sort(),
        older: inbox.older.map((t) => [t.title, t.ageDays]),
      };
    };
    expect(await earlier()).toEqual([
      ["Problem set 3", 1],
      ["Workshop 7 coding", 7],
    ]);
    // The undated library book is in the Inbox's own list already, so it isn't listed twice.
    expect(await older()).toEqual({
      tasks: ["Look into internships", "Return the library book", "Workshop 7 coding"],
      older: [["Submit advising form", 8]],
    });

    await alice.mutation(api.account.updateProfile, { earlierWindow: "month" });
    expect(await earlier()).toEqual([
      ["Submit advising form", 8],
      ["Problem set 3", 1],
      ["Workshop 7 coding", 7],
    ]);
    expect((await older()).older).toEqual([]);

    await alice.mutation(api.account.updateProfile, { earlierWindow: "all" });
    expect((await earlier()).map(([title]) => title)).toEqual([
      "Submit advising form",
      "Problem set 3",
      "Workshop 7 coding",
      "Return the library book",
    ]);

    await alice.mutation(api.account.updateProfile, { earlierWindow: "none" });
    expect(await earlier()).toEqual([]);
    expect((await older()).older).toEqual([
      ["Problem set 3", 1],
      ["Submit advising form", 8],
    ]);
  });
});

describe("routines", () => {
  // Tuesday 13 October 2026; Gym runs Mon, Wed, Fri and Sat.
  async function morning() {
    const ctx = await setup();
    const { alice } = ctx;
    const health = await alice.mutation(api.organize.addSpace, { name: "Health", color: "green" });
    const goal = await alice.mutation(api.organize.addGoal, {
      title: "Lose 5 kg",
      kind: "number",
      target: 5,
      unit: "kg",
    });
    const meditate = await alice.mutation(api.organize.addHabit, { title: "Meditate", target: 7 });
    const gym = await alice.mutation(api.organize.addHabit, { title: "Gym", target: 4, goalId: goal });
    const read = await alice.mutation(api.organize.addHabit, { title: "Read", target: 5 });
    const routineId = await alice.mutation(api.routines.add, {
      title: "Morning routine",
      spaceId: health,
      time: 420,
      parts: [
        { title: "Brush teeth", length: 5 },
        { title: "Meditate", length: 10, habitId: meditate },
        { title: "Gym", length: 45, habitId: gym, weekdays: [0, 2, 4, 5] },
        { title: "Cold plunge", length: 5 },
        { title: "Shower", length: 10 },
      ],
    });
    return { ...ctx, health, goal, meditate, gym, read, routineId };
  }

  test("a day shows only the parts that run that weekday, with their length added up", async () => {
    const { alice, routineId, health } = await morning();
    const tue = (await alice.query(api.views.today, { today: "2026-10-13" })).routines;
    expect(tue).toEqual([
      {
        _id: routineId,
        title: "Morning routine",
        color: "green",
        spaceId: health,
        time: 420,
        length: 30,
        parts: [
          { index: 0, title: "Brush teeth", length: 5, habitId: null, done: false },
          { index: 1, title: "Meditate", length: 10, habitId: expect.any(String), done: false },
          { index: 3, title: "Cold plunge", length: 5, habitId: null, done: false },
          { index: 4, title: "Shower", length: 10, habitId: null, done: false },
        ],
        streak: 0,
        done: false,
      },
    ]);
    const wed = (await alice.query(api.views.today, { today: "2026-10-14" })).routines[0]!;
    expect([wed.length, wed.parts.map((p) => [p.index, p.title])]).toEqual([
      75,
      [
        [0, "Brush teeth"],
        [1, "Meditate"],
        [2, "Gym"],
        [3, "Cold plunge"],
        [4, "Shower"],
      ],
    ]);
  });

  test("habits inside a routine leave Today's own habits and say which routine and goal they feed", async () => {
    const { alice, routineId, goal, today } = await morning();
    const day = await alice.query(api.views.today, { today });
    expect(day.habits.map((h) => [h.title, h.routineId, h.goalId])).toEqual([["Read", null, null]]);
    const progress = await alice.query(api.views.progress, { today });
    expect(progress.habits.map((h) => [h.title, h.routineId, h.goalId])).toEqual([
      ["Meditate", routineId, null],
      ["Gym", routineId, goal],
      ["Read", null, null],
    ]);
  });

  test("ticking a part checks its habit, and unticking takes the check back", async () => {
    const { alice, routineId, meditate } = await morning();
    const wed = "2026-10-14";
    await alice.mutation(api.routines.tickPart, { routineId, index: 2, date: wed, done: true });
    await alice.mutation(api.routines.tickPart, { routineId, index: 1, date: wed, done: true });
    const habits = async () =>
      (await alice.query(api.views.progress, { today: wed })).habits.map((h) => [
        h.title,
        h.doneToday,
        h.thisWeek,
      ]);
    expect(await habits()).toEqual([
      ["Meditate", true, 1],
      ["Gym", true, 1],
      ["Read", false, 0],
    ]);
    const parts = async () =>
      (await alice.query(api.views.today, { today: wed })).routines[0]!.parts.filter((p) => p.done).map(
        (p) => p.title,
      );
    expect(await parts()).toEqual(["Meditate", "Gym"]);

    await alice.mutation(api.routines.tickPart, { routineId, index: 1, date: wed, done: false });
    expect(await habits()).toEqual([
      ["Meditate", false, 0],
      ["Gym", true, 1],
      ["Read", false, 0],
    ]);
    expect(await parts()).toEqual(["Gym"]);

    // Checking the habit on its own reads as that part done too.
    await alice.mutation(api.organize.checkHabit, { id: meditate, done: true, date: wed });
    expect(await parts()).toEqual(["Meditate", "Gym"]);
  });

  test("a part that doesn't run that day, or isn't there, can't be ticked", async () => {
    const { alice, routineId } = await morning();
    await expect(
      alice.mutation(api.routines.tickPart, { routineId, index: 2, date: "2026-10-13", done: true }),
    ).rejects.toThrow("Gym isn't part of Morning routine on that day.");
    await expect(
      alice.mutation(api.routines.tickPart, { routineId, index: 9, date: "2026-10-13", done: true }),
    ).rejects.toThrow("Morning routine has parts 0 to 4.");
  });

  test("the streak counts days all done back from yesterday, and today once it's done", async () => {
    const { alice, routineId, today } = await morning();
    for (const date of ["2026-10-09", "2026-10-11", "2026-10-12"])
      await alice.mutation(api.routines.tickAll, { routineId, date, done: true });
    // Saturday the 10th was missed, so the run starts on Sunday.
    const read = async () => {
      const r = (await alice.query(api.views.today, { today })).routines[0]!;
      return [r.streak, r.done];
    };
    expect(await read()).toEqual([2, false]);
    await alice.mutation(api.routines.tickAll, { routineId, date: today, done: true });
    expect(await read()).toEqual([3, true]);
    await alice.mutation(api.routines.tickAll, { routineId, date: "2026-10-10", done: true });
    expect(await read()).toEqual([5, true]);
    // Taking back one part of Monday's breaks the run there.
    await alice.mutation(api.routines.tickPart, { routineId, index: 4, date: "2026-10-12", done: false });
    expect(await read()).toEqual([1, true]);
  });

  test("tick all checks every habit for that day, and all undone unchecks them", async () => {
    const { alice, routineId } = await morning();
    const sat = "2026-10-17";
    await alice.mutation(api.routines.tickAll, { routineId, date: sat, done: true });
    const habits = async () =>
      (await alice.query(api.views.progress, { today: sat })).habits.map((h) => [h.title, h.doneToday]);
    expect(await habits()).toEqual([
      ["Meditate", true],
      ["Gym", true],
      ["Read", false],
    ]);
    await alice.mutation(api.routines.tickAll, { routineId, date: sat, done: false });
    expect(await habits()).toEqual([
      ["Meditate", false],
      ["Gym", false],
      ["Read", false],
    ]);
  });

  test("a habit belongs to one routine; an archived routine gives its habits back to Today", async () => {
    const { alice, routineId, meditate, today } = await morning();
    await expect(
      alice.mutation(api.routines.add, {
        title: "Night routine",
        time: 1320,
        parts: [{ title: "Meditate", habitId: meditate }],
      }),
    ).rejects.toThrow("Meditate is already part of Morning routine.");
    await expect(
      alice.mutation(api.routines.update, { routineId, parts: [{ title: "Stretch", weekdays: [] }] }),
    ).rejects.toThrow(/at least one weekday/);
    await alice.mutation(api.routines.update, { routineId, title: "Mornings", time: 435 });
    expect((await alice.query(api.views.today, { today })).routines.map((r) => [r.title, r.time])).toEqual([
      ["Mornings", 435],
    ]);
    await alice.mutation(api.routines.remove, { routineId });
    const day = await alice.query(api.views.today, { today });
    expect(day.routines).toEqual([]);
    expect(day.habits.map((h) => h.title)).toEqual(["Meditate", "Gym", "Read"]);
  });

  test("nobody else can see, change or tick a person's routine", async () => {
    const { t, routineId, today } = await morning();
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    expect((await bob.query(api.views.today, { today })).routines).toEqual([]);
    await expect(bob.mutation(api.routines.tickAll, { routineId, date: today, done: true })).rejects.toThrow(
      "That routine doesn't exist or isn't yours.",
    );
    await expect(bob.mutation(api.routines.remove, { routineId })).rejects.toThrow(/isn't yours/);
  });
});

describe("goal entries and what feeds a goal", () => {
  test("logging a money goal sets where it stands and keeps one entry a day for the trend line", async () => {
    const { alice, today } = await setup();
    const goalId = await alice.mutation(api.organize.addGoal, {
      title: "Save $2,000",
      kind: "number",
      target: 2000,
      unit: "$",
      dueDate: "2026-12-31",
    });
    await alice.mutation(api.goals.log, { goalId, value: 300, date: "2026-09-01" });
    await alice.mutation(api.goals.log, { goalId, value: 900, date: "2026-10-01" });
    await alice.mutation(api.goals.log, { goalId, value: 1220 });
    // A second log the same day replaces the first.
    await alice.mutation(api.goals.log, { goalId, value: 1240 });
    // History filled in later doesn't move where it stands now.
    await alice.mutation(api.goals.log, { goalId, value: 600, date: "2026-09-15" });
    const [goal] = await alice.query(api.views.goals, { today });
    expect([goal!.current, goal!.unit, goal!.progress, goal!.entries]).toEqual([
      1240,
      "$",
      0.62,
      [
        { date: "2026-09-01", value: 300 },
        { date: "2026-09-15", value: 600 },
        { date: "2026-10-01", value: 900 },
        { date: "2026-10-13", value: 1240 },
      ],
    ]);
  });

  test("the trend line keeps the last 12 entries", async () => {
    const { alice, today } = await setup();
    const goalId = await alice.mutation(api.organize.addGoal, {
      title: "Run 100 km",
      kind: "number",
      target: 100,
    });
    for (let day = 1; day <= 13; day++)
      await alice.mutation(api.goals.log, {
        goalId,
        value: day * 5,
        date: `2026-10-${String(day).padStart(2, "0")}`,
      });
    const [goal] = await alice.query(api.views.goals, { today });
    expect(goal!.entries.map((e) => e.date)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 2).padStart(2, "0")}`),
    );
    expect(goal!.current).toBe(65);
  });

  test("only a number goal takes a log, of something that already happened", async () => {
    const { alice } = await setup();
    const tasksGoal = await alice.mutation(api.organize.addGoal, {
      title: "Ship 3.0",
      kind: "tasks",
      target: 5,
    });
    await expect(alice.mutation(api.goals.log, { goalId: tasksGoal, value: 2 })).rejects.toThrow(
      /nothing to log/,
    );
    const goalId = await alice.mutation(api.organize.addGoal, {
      title: "Lose 5 kg",
      kind: "number",
      target: 5,
    });
    await expect(alice.mutation(api.goals.log, { goalId, value: 1, date: "2026-10-14" })).rejects.toThrow(
      "Log what's already happened, today or before.",
    );
    await expect(alice.mutation(api.goals.log, { goalId, value: -1 })).rejects.toThrow(
      "Progress can't be below 0.",
    );
  });

  test("a goal says which habits feed it and counts its linked tasks, done ones too", async () => {
    const { t, alice, today } = await setup();
    const ship = await alice.mutation(api.organize.addGoal, { title: "Ship 3.0", kind: "tasks", target: 4 });
    const weight = await alice.mutation(api.organize.addGoal, {
      title: "Lose 5 kg",
      kind: "number",
      target: 5,
    });
    await alice.mutation(api.organize.addHabit, { title: "Gym", target: 4, goalId: weight });
    const walk = await alice.mutation(api.organize.addHabit, { title: "Walk", target: 3 });
    await alice.mutation(api.organize.updateHabit, { id: walk, goalId: weight });
    const archived = await alice.mutation(api.organize.addHabit, {
      title: "Swim",
      target: 2,
      goalId: weight,
    });
    await alice.mutation(api.organize.updateHabit, { id: archived, archived: true });
    await alice.mutation(api.tasks.add, { title: "Weigh in", goalId: weight });
    const a = await alice.mutation(api.tasks.add, { title: "Build Today", goalId: ship });
    await alice.mutation(api.tasks.add, { title: "Build the menu", goalId: ship, date: today });
    const gone = await alice.mutation(api.tasks.add, { title: "Old idea", goalId: ship });
    await alice.mutation(api.tasks.complete, { id: a });
    await alice.mutation(api.tasks.remove, { id: gone });
    // An agent's task counts like the person's own.
    await t.mutation(internal.agent.add_task, {
      ownerId: ALICE.tokenIdentifier,
      agent: "Claude",
      title: "Ship notes",
      goalId: ship,
    });
    const goals = await alice.query(api.views.goals, { today });
    expect(goals.map((g) => [g.title, g.feeds, g.next?.title ?? null, g.current])).toEqual([
      ["Ship 3.0", { habits: [], tasks: 3 }, "Build the menu", 1],
      ["Lose 5 kg", { habits: ["Gym", "Walk"], tasks: 1 }, "Weigh in", 0],
    ]);
  });
});

describe("study sessions", () => {
  test("a session says which test it prepares for and how many days are left from its own day", async () => {
    const { alice, today } = await setup();
    const exam = await alice.mutation(api.tasks.add, {
      title: "CSC 316 exam 2",
      date: "2026-10-20",
      time: 810,
      length: 75,
      event: true,
    });
    const study = await alice.mutation(api.tasks.add, {
      title: "Study for CSC 316 exam 2",
      date: today,
      time: 510,
      length: 90,
      repeat: { freq: "day", interval: 1, end: { kind: "on", date: "2026-10-19" } },
      prepFor: exam,
    });
    const day = await alice.query(api.views.today, { today });
    expect(day.scheduled.map((t) => [t.title, t.prepFor])).toEqual([
      ["Study for CSC 316 exam 2", { title: "CSC 316 exam 2", date: "2026-10-20", daysLeft: 7 }],
    ]);
    const week = await alice.query(api.views.week, { start: "2026-10-12", today });
    expect(
      week.days.map((d) => [d.date, d.scheduled.find((t) => t._id === study)?.prepFor?.daysLeft ?? null]),
    ).toEqual([
      ["2026-10-12", null],
      ["2026-10-13", 7],
      ["2026-10-14", 6],
      ["2026-10-15", 5],
      ["2026-10-16", 4],
      ["2026-10-17", 3],
      ["2026-10-18", 2],
    ]);
    // The exam itself prepares for nothing.
    expect(week.days.flatMap((d) => d.scheduled).find((t) => t._id === exam)).toBeUndefined();
    await alice.mutation(api.tasks.update, { id: study, prepFor: null });
    expect((await alice.query(api.views.today, { today })).scheduled[0]!.prepFor).toBeNull();
  });

  test("a deleted test stops showing, and a task can't prepare for itself or someone else's", async () => {
    const { t, alice, today } = await setup();
    const exam = await alice.mutation(api.tasks.add, {
      title: "Physics midterm",
      date: "2026-10-16",
      event: true,
    });
    const study = await alice.mutation(api.tasks.add, {
      title: "Review chapter 7",
      date: today,
      prepFor: exam,
    });
    await expect(alice.mutation(api.tasks.update, { id: study, prepFor: study })).rejects.toThrow(
      "A task can't prepare for itself.",
    );
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    await expect(bob.mutation(api.tasks.add, { title: "Copy", prepFor: exam })).rejects.toThrow(
      "That task to prepare for doesn't exist or isn't yours.",
    );
    expect((await alice.query(api.views.today, { today })).anytime[0]!.prepFor).toEqual({
      title: "Physics midterm",
      date: "2026-10-16",
      daysLeft: 3,
    });
    await alice.mutation(api.tasks.remove, { id: exam });
    expect((await alice.query(api.views.today, { today })).anytime[0]!.prepFor).toBeNull();
  });

  test("an agent links a session to its test, reads it back, and Undo takes the link away", async () => {
    const { t, alice, today } = await setup();
    const owner = { ownerId: ALICE.tokenIdentifier, agent: "Claude" };
    const exam = await alice.mutation(api.tasks.add, {
      title: "Calculus exam",
      date: "2026-10-23",
      event: true,
    });
    const study = await alice.mutation(api.tasks.add, { title: "Practice integrals", date: today });
    const { task } = await t.mutation(internal.agent.update_task, { ...owner, taskId: study, prepFor: exam });
    expect(task.prepFor).toEqual({ title: "Calculus exam", date: "2026-10-23", daysLeft: 10 });
    const [change] = await alice.query(api.assistant.activity, { today, days: 1 });
    await alice.mutation(api.assistant.undoAction, { id: change!._id });
    expect((await alice.query(api.views.task, { id: study }))?.prepFor).toBeUndefined();
  });
});

describe("agents plan routines, goals and study sessions", () => {
  async function withToken(name = "Claude") {
    const ctx = await setup();
    const { token } = await ctx.alice.mutation(api.account.createToken, { name });
    const call = async (op: string, body: unknown = {}) => {
      const res = await ctx.t.fetch(`/api/v1/${op}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as { result?: any; error?: string } };
    };
    const ok = async (op: string, body: unknown = {}) => {
      const reply = await call(op, body);
      if (reply.status !== 200) throw new Error(`${op}: ${reply.status} ${reply.body.error}`);
      return reply.body.result;
    };
    return { ...ctx, call, ok };
  }

  test("an agent builds a morning routine with habits that feed a goal, and ticks it", async () => {
    const { alice, ok, call, today } = await withToken();
    const { goalId } = await ok("add_goal", { title: "Lose 5 kg", kind: "number", target: 5, unit: "kg" });
    const { habitId: gym } = await ok("add_habit", { title: "Gym", target: 4, goalId });
    const { habitId: meditate } = await ok("add_habit", { title: "Meditate", target: 7 });
    const { routineId } = await ok("add_routine", {
      title: "Morning routine",
      time: 420,
      parts: [
        { title: "Brush teeth", length: 5 },
        { title: "Meditate", length: 10, habitId: meditate },
        { title: "Gym", length: 45, habitId: gym, weekdays: [0, 2, 4, 5] },
      ],
    });
    expect((await ok("list_routines")).routines).toEqual([
      {
        _id: routineId,
        title: "Morning routine",
        spaceId: null,
        time: 420,
        parts: [
          { index: 0, title: "Brush teeth", length: 5, habitId: null, weekdays: null },
          { index: 1, title: "Meditate", length: 10, habitId: meditate, weekdays: null },
          { index: 2, title: "Gym", length: 45, habitId: gym, weekdays: [0, 2, 4, 5] },
        ],
      },
    ]);
    const ticked = await ok("tick_routine", { routineId, index: 1, done: true });
    expect([ticked.date, ticked.done, ticked.parts.map((p: { done: boolean }) => p.done)]).toEqual([
      today,
      false,
      [false, true],
    ]);
    const all = await ok("tick_routine", { routineId, done: true });
    expect([all.done, all.streak]).toEqual([true, 1]);
    const day = await ok("get_today");
    expect([day.routines[0].done, day.habits]).toEqual([true, []]);
    const [goal] = await alice.query(api.views.goals, { today });
    expect(goal!.feeds).toEqual({ habits: ["Gym"], tasks: 0 });

    await ok("update_routine", { routineId, title: "Mornings", time: 435 });
    expect((await call("tick_routine", { routineId, index: 2, done: true })).body).toEqual({
      error: "Gym isn't part of Mornings on that day.",
    });
    await ok("update_habit", { habitId: gym, goalId: null });
    await ok("delete_routine", { routineId });
    expect((await ok("get_today")).habits.map((h: { title: string }) => h.title)).toEqual([
      "Gym",
      "Meditate",
    ]);
    const actions = await alice.query(api.assistant.activity, { today, days: 1 });
    expect(actions.slice(0, 5).map((a) => [a.agent, a.kind, a.title, a.undoable])).toEqual([
      ["Claude", "other", "Archived routine Mornings", false],
      ["Claude", "other", "Habit Gym", false],
      ["Claude", "other", "Routine Mornings", false],
      ["Claude", "other", "Ticked Morning routine", false],
      ["Claude", "other", "Ticked Meditate in Morning routine", false],
    ]);
  });

  test("an agent logs a money goal and links a study session to its exam", async () => {
    const { ok, call, today } = await withToken();
    const { goalId } = await ok("add_goal", {
      title: "Save $2,000",
      kind: "number",
      target: 2000,
      unit: "$",
    });
    await ok("log_goal", { goalId, value: 900, date: "2026-10-01" });
    expect(await ok("log_goal", { goalId, value: 1240 })).toEqual({ goalId, current: 1240 });
    const progress = await ok("get_progress");
    expect(progress.goals[0].entries).toEqual([
      { date: "2026-10-01", value: 900 },
      { date: today, value: 1240 },
    ]);
    expect((await call("log_goal", { goalId, value: 50, date: "2026-10-20" })).status).toBe(400);

    const { taskId: exam } = await ok("add_task", {
      title: "CSC 316 exam 2",
      date: "2026-10-20",
      event: true,
    });
    const { task } = await ok("add_task", {
      text: "Study for CSC 316 exam 2 every day 8:30 for 1h30",
      prepFor: exam,
    });
    expect(task.prepFor).toEqual({ title: "CSC 316 exam 2", date: "2026-10-20", daysLeft: 7 });
    const batch = await ok("update_tasks", { updates: [{ taskId: task._id, prepFor: "not-an-id" }] });
    expect(batch.results[0]).toEqual({
      index: 0,
      ok: false,
      error: "That task to prepare for doesn't exist or isn't yours.",
    });
  });
});

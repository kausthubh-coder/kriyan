/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { todayIn } from "@kriyan/core/dates";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { validatorMessage } from "./http";
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
      title: "Call Mum",
      time: 1020,
    });
    const day = await alice.query(api.views.today, { today });
    expect(day.scheduled.map((x) => [x.title, x.time])).toEqual([
      ["Call Mum", 1020],
      ["Water the plants", 1080],
    ]);
    expect(await alice.query(api.views.inbox, {})).toEqual([]);
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
    expect((await alice.query(api.views.inbox, {})).map((x) => x.title)).toEqual(["Ship the CLI"]);
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
      title: "Mum's birthday",
      body: "Tomorrow",
      tokens: [],
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
      expect(((await res.json()) as { result: { title: string }[] }).result.map((x) => x.title)).toEqual([
        "Book the dentist",
      ]);
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

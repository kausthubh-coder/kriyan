// Runs the real `kriyan` process against a fake agent API and checks exactly what a person sees.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as f from "./fixtures.ts";
import { FakeApi, kriyan, tempConfigDir } from "./harness.ts";

const api = new FakeApi({
  get_today: (b) => ({ result: f.today(typeof b.date === "string" ? b.date : "2026-10-13") }),
  get_week: () => ({ result: f.week() }),
  get_inbox: () => ({ result: f.inbox }),
  list_spaces: () => ({ result: f.spaces }),
  get_progress: () => ({ result: f.progress() }),
  add_task: () => ({ result: { taskId: "k57added00000000000000000000013" } }),
  complete_task: (b) =>
    b.taskId === f.ids.gym
      ? { result: { taskId: b.taskId, finished: false, next: "2026-10-15" } }
      : b.taskId === f.ids.rent
        ? { error: "That task is already done." }
        : { result: { taskId: b.taskId, finished: true } },
  move_tasks: (b) => ({ result: { moved: (b.taskIds as string[]).length } }),
  delete_task: (b) => ({ result: { taskId: b.taskId } }),
  check_habit: (b) => ({ result: { habitId: b.habitId, done: b.done } }),
  propose_plan: (b) => ({
    result: { taskIds: (b.blocks as unknown[]).map((_, i) => `k57proposed${i}`), proposed: true },
  }),
});

let dir: string;
const env = () => ({ KRIYAN_API_URL: api.url, KRIYAN_TOKEN: f.TOKEN, KRIYAN_CONFIG_DIR: dir });
const run = (...args: string[]) => kriyan(args, { env: env() });

beforeAll(() => api.start());
afterAll(() => api.stop());
beforeEach(() => {
  dir = tempConfigDir();
  api.requests.length = 0;
});

const TODAY = `Today, Tue 13 Oct

Now   Calculus lecture, until 11:30
Next  Essay draft at 14:00, in 3 h 20 min

Schedule
  1  07:30–08:30  Gym               Life               done
  2  10:00–11:30  Calculus lecture  School / Calculus
  3  14:00–15:30  Essay draft       School
  4  16:00–17:00  Read chapter 4    School             proposed by Claude
  5  18:00        Call mum          Life

Anytime
  6               Buy stamps        Life

From earlier
  7  Mon 12 Oct   Problem set 3     School / Calculus

Done
  8               Pay rent          Life

Habits
  Read     1 of 5 this week
  Stretch  2 of 3 this week  done today

Free time left: 9 h until 22:00

1 proposed block is waiting for you in the app.
`;

describe("reading", () => {
  test("today shows now and next, the day, habits and free time left", async () => {
    const r = await run("today");
    expect(r).toEqual({ code: 0, stdout: TODAY, stderr: "" });
    expect(api.requests).toEqual([{ op: "get_today", auth: `Bearer ${f.TOKEN}`, body: {} }]);
  });

  test("today with a date phrase asks for that day and counts free time over the whole day", async () => {
    const r = await run("today", "tomorrow");
    expect(api.requests[0]!.body).toEqual({ date: "2026-10-14" });
    expect(r.code).toBe(0);
    expect(r.stdout.split("\n")[0]).toBe("Tomorrow, Wed 14 Oct");
    expect(r.stdout).not.toContain("Now ");
    expect(r.stdout).toContain("\nFree time: 11 h between 08:00 and 22:00\n");
  });

  test("today --json prints the API's result untouched", async () => {
    const r = await run("today", "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(f.today());
  });

  test("an unknown date phrase is a usage error and calls nothing", async () => {
    const r = await run("today", "someday");
    expect(r).toEqual({
      code: 2,
      stdout: "",
      stderr: `"someday" isn't a date Kriyan knows. Try tomorrow, fri, next mon, 13 oct or 2026-10-13.\n`,
    });
    expect(api.requests).toEqual([]);
  });

  test("week shows each day with planned time, deadlines, the inbox and tasks with no date", async () => {
    const r = await run("week");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`Week of Mon 12 Oct

Mon 12 Oct
   1               Problem set 3     School / Calculus

Tue 13 Oct, today  3 h 30 min of 7 h planned
   2  07:30–08:30  Gym               Life               done
   3  10:00–11:30  Calculus lecture  School / Calculus
   4  14:00–15:30  Essay draft       School
   5  16:00–17:00  Read chapter 4    School             proposed by Claude
   6  18:00        Call mum          Life
   7               Buy stamps        Life
   8               Pay rent          Life               done

Wed 14 Oct
  Nothing planned

Thu 15 Oct
   3  10:00–11:30  Calculus lecture  School / Calculus
   4  due          Essay draft       School

Fri 16 Oct         8 h planned, 1 h over your 7 h
   9  09:00–17:00  Revision          School

Sat 17 Oct
  Nothing planned

Sun 18 Oct
  Nothing planned

Inbox
  10               Book the dentist

No date yet
  11               Essay plan        School

1 proposed block is waiting for you in the app.
`);
  });

  test("week with a start date sends it", async () => {
    await run("week", "19", "oct");
    expect(api.requests[0]).toMatchObject({ op: "get_week", body: { start: "2026-10-19" } });
  });

  test("inbox, spaces and progress", async () => {
    expect((await run("inbox")).stdout).toBe("Inbox\n  1  Book the dentist\n  2  Renew passport\n");
    expect((await run("spaces")).stdout).toBe("School\n  Calculus\nLife\n");
    expect((await run("progress")).stdout).toBe(`Time done
  This week       4 h 30 min
  Last 12 months  120 h 15 min

By space
  School  80 h
  Life    40 h 15 min

Goals
  Run 100 km               42.5 of 100 km  43%  behind pace, by Thu 31 Dec
  Finish the reading list  9 of 12 tasks   75%

Habits
  Read     1 of 5 this week  10 in the last 30 days
  Stretch  2 of 3 this week  10 in the last 30 days
`);
    expect(api.ops()).toEqual(["get_inbox", "list_spaces", "get_progress"]);
  });

  test("spaces --json includes ids for kriyan call", async () => {
    const r = await run("spaces", "--json");
    expect(JSON.parse(r.stdout)).toEqual(f.spaces);
  });
});

describe("adding", () => {
  test("add sends the sentence and echoes what quick add understood", async () => {
    const r = await run("add", "essay fri 5pm #school every week remind 1h before");
    expect(api.requests).toEqual([
      {
        op: "add_task",
        auth: `Bearer ${f.TOKEN}`,
        body: { text: "essay fri 5pm #school every week remind 1h before" },
      },
    ]);
    expect(r).toEqual({
      code: 0,
      stderr: "",
      stdout: `Added "essay"
  Date      Fri 16 Oct
  Time      17:00
  Space     school
  Repeats   Every Fri
  Reminder  1 h before
`,
    });
  });

  test("add without quotes joins the words; nothing to schedule goes to the inbox", async () => {
    const r = await run("add", "buy", "stamps");
    expect(api.requests[0]!.body).toEqual({ text: "buy stamps" });
    expect(r.stdout).toBe(`Added "buy stamps" to your inbox.\n`);
  });

  test("add --json returns the task id and the parsed fields", async () => {
    const r = await run("add", "run every 2 days after done", "--json");
    expect(JSON.parse(r.stdout)).toEqual({
      taskId: "k57added00000000000000000000013",
      understood: {
        title: "run",
        date: "2026-10-13",
        repeat: { freq: "day", interval: 2, fromCompletion: true },
        reminders: [],
      },
    });
  });

  test("add with nothing to add is a usage error", async () => {
    const r = await run("add");
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(`Say what to add, like: kriyan add "essay fri 5pm #school"\n`);
  });
});

describe("changing tasks", () => {
  test("done takes the number from the last listing", async () => {
    await run("today");
    api.requests.length = 0;
    const r = await run("done", "3");
    expect(api.requests).toEqual([
      { op: "complete_task", auth: `Bearer ${f.TOKEN}`, body: { taskId: f.ids.essay } },
    ]);
    expect(r).toEqual({ code: 0, stdout: `Done "Essay draft".\n`, stderr: "" });
  });

  test("done on a repeating task says it moved on", async () => {
    await run("today");
    const r = await run("done", "1");
    expect(r.stdout).toBe(`Done "Gym". Next: Thu 15 Oct.\n`);
  });

  test("done by part of a title looks through today and the week", async () => {
    const r = await run("done", "call", "MUM");
    expect(api.ops().slice(0, 2).sort()).toEqual(["get_today", "get_week"]);
    expect(api.ops()[2]).toBe("complete_task");
    expect(api.requests[2]!.body).toEqual({ taskId: f.ids.call });
    expect(r.stdout).toBe(`Done "Call mum".\n`);
  });

  test("a title that matches several tasks lists them with numbers, and the numbers then work", async () => {
    const r = await run("done", "essay");
    expect(r).toEqual({
      code: 2,
      stdout: "",
      stderr: `"essay" matches 2 tasks:
  1  Essay draft  Tue 13 Oct 14:00
  2  Essay plan
Run the command again with a number, or more of the title.
`,
    });
    // Both reads go out together, so either may land first.
    expect(api.ops().sort()).toEqual(["get_today", "get_week"]);
    await run("done", "2");
    expect(api.requests.at(-1)).toMatchObject({ op: "complete_task", body: { taskId: f.ids.essayPlan } });
  });

  test("a number with no listing behind it is a usage error", async () => {
    const r = await run("done", "4");
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(
      "There's no task 4 in your last listing. Run kriyan today or kriyan week to see the numbers.\n",
    );
    expect(api.requests).toEqual([]);
  });

  test("an id goes straight to the API", async () => {
    const r = await run("done", f.ids.dentist);
    expect(api.requests).toEqual([
      { op: "complete_task", auth: `Bearer ${f.TOKEN}`, body: { taskId: f.ids.dentist } },
    ]);
    expect(r.stdout).toBe(`Done ${f.ids.dentist}.\n`);
  });

  test("move several tasks to a day and a time", async () => {
    await run("today");
    api.requests.length = 0;
    const r = await run("move", "3", "5", "fri", "9am");
    expect(api.requests).toEqual([
      {
        op: "move_tasks",
        auth: `Bearer ${f.TOKEN}`,
        body: { taskIds: [f.ids.essay, f.ids.call], date: "2026-10-16", time: 540 },
      },
    ]);
    expect(r.stdout).toBe("Moved 2 tasks to Fri 16 Oct at 09:00.\n");
  });

  test("move by title to a date keeps the time", async () => {
    const r = await run("move", "problem set", "tomorrow");
    expect(api.requests.at(-1)).toMatchObject({
      op: "move_tasks",
      body: { taskIds: [f.ids.problems], date: "2026-10-14" },
    });
    expect(api.requests.at(-1)!.body).not.toHaveProperty("time");
    expect(r.stdout).toBe(`Moved "Problem set 3" to Wed 14 Oct.\n`);
  });

  test("move without a when is a usage error", async () => {
    const r = await run("move", "3");
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(
      "Say which task and when, like: kriyan move 3 tomorrow, or kriyan move essay fri 9am\n",
    );
  });

  test("rm deletes and says how to get it back", async () => {
    await run("inbox");
    const r = await run("rm", "2");
    expect(api.requests.at(-1)).toMatchObject({
      op: "delete_task",
      body: { taskId: "k57passport00000000000000000012" },
    });
    expect(r.stdout).toBe(`Deleted "Renew passport". You can restore it from the app.\n`);
  });

  test("habit checks and unchecks by part of the name", async () => {
    let r = await run("habit", "rea");
    expect(api.requests.at(-1)).toMatchObject({
      op: "check_habit",
      body: { habitId: f.ids.readHabit, done: true },
    });
    expect(r.stdout).toBe(`Checked "Read" for today. 2 of 5 this week.\n`);
    r = await run("habit", "stretch", "--undo");
    expect(api.requests.at(-1)).toMatchObject({
      op: "check_habit",
      body: { habitId: f.ids.stretch, done: false },
    });
    expect(r.stdout).toBe(`Unchecked "Stretch" for today. 1 of 3 this week.\n`);
  });

  test("propose sends the blocks from a file under the agent's name", async () => {
    const file = join(dir, "plan.json");
    const blocks = [
      { title: "Essay draft", date: "2026-10-14", time: 870, length: 90 },
      { title: "Revise limits", date: "2026-10-15", time: 600 },
    ];
    writeFileSync(file, JSON.stringify({ blocks }));
    const r = await run("propose", "--agent", "Claude", "--file", file);
    expect(api.requests).toEqual([
      { op: "propose_plan", auth: `Bearer ${f.TOKEN}`, body: { agent: "Claude", blocks } },
    ]);
    expect(r.stdout).toBe(`Proposed 2 blocks from Claude. Accept or discard them in the app.
  Wed 14 Oct  14:30–16:00  Essay draft
  Thu 15 Oct  10:00        Revise limits
`);
  });
});

describe("errors and exit codes", () => {
  test("when the API says no, its message is printed as is and the exit code is 1", async () => {
    await run("today");
    const r = await run("done", "8");
    expect(r).toEqual({ code: 1, stdout: "", stderr: "That task is already done.\n" });
  });

  test("a rejected token exits 1 with the API's message", async () => {
    const r = await kriyan(["today"], { env: { ...env(), KRIYAN_TOKEN: "kriyan_wrong" } });
    expect(r).toEqual({
      code: 1,
      stdout: "",
      stderr: "Send a personal access token: Authorization: Bearer kriyan_... Create one in Settings.\n",
    });
  });

  test("no token at all is a usage error", async () => {
    const r = await kriyan(["today"], { env: { ...env(), KRIYAN_TOKEN: undefined } });
    expect(r).toEqual({
      code: 2,
      stdout: "",
      stderr: "You're not signed in. Run kriyan login, or set KRIYAN_TOKEN.\n",
    });
  });

  test("an unreachable server exits 2", async () => {
    const r = await kriyan(["today"], { env: { ...env(), KRIYAN_API_URL: "http://127.0.0.1:9" } });
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(
      /^Couldn't reach http:\/\/127\.0\.0\.1:9 \(.+\)\. Check your connection, or KRIYAN_API_URL\.\n$/,
    );
  });

  test("unknown commands and options exit 2", async () => {
    expect(await run("plant")).toEqual({
      code: 2,
      stdout: "",
      stderr: `There's no command called "plant". Run kriyan --help to see them.\n`,
    });
    expect(await run("today", "--colour")).toEqual({
      code: 2,
      stdout: "",
      stderr: "There's no option --colour. Run kriyan --help to see the options.\n",
    });
  });
});

describe("raw operations", () => {
  test("call runs any operation with a JSON input and prints JSON", async () => {
    const r = await run("call", "get_today", '{"date":"2026-10-15"}');
    expect(api.requests).toEqual([
      { op: "get_today", auth: `Bearer ${f.TOKEN}`, body: { date: "2026-10-15" } },
    ]);
    expect(JSON.parse(r.stdout)).toEqual(f.today("2026-10-15"));
  });

  test("call rejects unknown operations and bad JSON before sending anything", async () => {
    expect(await run("call", "get_garden")).toEqual({
      code: 2,
      stdout: "",
      stderr: `There's no operation called "get_garden". Run kriyan ops to see them.\n`,
    });
    expect(await run("call", "get_today", "{date:")).toEqual({
      code: 2,
      stdout: "",
      stderr: "The input isn't valid JSON: {date:\n",
    });
    expect(api.requests).toEqual([]);
  });

  test("ops lists every operation", async () => {
    const r = await run("ops");
    const lines = r.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(23);
    expect(lines[0]).toBe("get_today      read   Get today");
    expect(lines.at(-1)).toBe("propose_plan   write  Propose a plan");
  });
});

describe("signing in", () => {
  test("login checks the token, then saves it privately with the person's time zone", async () => {
    const r = await kriyan(["login", "--token", f.TOKEN], {
      env: { KRIYAN_API_URL: api.url, KRIYAN_CONFIG_DIR: dir, KRIYAN_TOKEN: undefined },
    });
    const path = join(dir, "config.json");
    expect(r).toEqual({ code: 0, stdout: `Signed in. Saved your token in ${path}\n`, stderr: "" });
    expect(api.requests).toEqual([{ op: "get_today", auth: `Bearer ${f.TOKEN}`, body: {} }]);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      token: f.TOKEN,
      apiUrl: api.url,
      timeZone: "Europe/London",
    });
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);

    // The saved token and server are used without any environment.
    const today = await kriyan(["today"], {
      env: { KRIYAN_CONFIG_DIR: dir, KRIYAN_TOKEN: undefined, KRIYAN_API_URL: undefined },
    });
    expect(today.stdout).toBe(TODAY);

    const out = await kriyan(["logout"], { env: { KRIYAN_CONFIG_DIR: dir, KRIYAN_TOKEN: undefined } });
    expect(out.stdout).toBe(`Signed out. Removed your token from ${path}\n`);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(join(dir, "last-listing.json"))).toBe(false);
  });

  test("login reads a piped token", async () => {
    const r = await kriyan(["login"], {
      env: { KRIYAN_API_URL: api.url, KRIYAN_CONFIG_DIR: dir, KRIYAN_TOKEN: undefined },
      stdin: `${f.TOKEN}\n`,
    });
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).token).toBe(f.TOKEN);
  });

  test("a rejected token is not saved", async () => {
    const r = await kriyan(["login", "--token", "kriyan_wrong"], {
      env: { KRIYAN_API_URL: api.url, KRIYAN_CONFIG_DIR: dir, KRIYAN_TOKEN: undefined },
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      "Send a personal access token: Authorization: Bearer kriyan_... Create one in Settings.\n",
    );
    expect(existsSync(join(dir, "config.json"))).toBe(false);
  });
});

describe("help", () => {
  test("every command has help with a usage line", async () => {
    for (const command of [
      "today",
      "week",
      "inbox",
      "spaces",
      "progress",
      "add",
      "done",
      "move",
      "rm",
      "habit",
      "propose",
      "login",
      "logout",
      "call",
      "ops",
    ]) {
      const r = await run(command, "--help");
      expect(r.code).toBe(0);
      expect(r.stdout.startsWith(`Usage: kriyan ${command}`)).toBe(true);
    }
    expect(api.requests).toEqual([]);
  });

  test("help text follows the copy rules", async () => {
    const r = await run("--help");
    expect(r.stdout).toContain('kriyan add "essay fri 5pm #school every week remind 1h before"');
    expect(r.stdout).not.toMatch(/—|overdue|·/i);
  });
});

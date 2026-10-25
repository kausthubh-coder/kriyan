// Resets the test account and fills it with a known plan, dated from today in the browser's
// time zone, so every e2e script starts from the same place on any day.
//   node apps/app/e2e/seed.mjs            reset, then seed
//   node apps/app/e2e/seed.mjs --reset    reset only (an empty account)
// Writes go through the agent API (see api.mjs); this checkout's local backend only.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { op as apiOp, saveUser } from "./api.mjs";
import { BASE, launch, settle, signedInContext } from "./lib.mjs";

const root = new URL("../../../", import.meta.url);
// The Convex CLI run directly (no shell), so JSON arguments keep their quotes on Windows.
const convexBin = fileURLToPath(new URL("node_modules/convex/bin/main.js", root));
const convex = (...args) => {
  try {
    return execFileSync(process.execPath, [convexBin, ...args], {
      cwd: new URL("packages/convex/", root),
      encoding: "utf8",
    }).trim();
  } catch (e) {
    // Node 24 on Windows can trip a libuv assertion while the CLI exits, after its work is
    // done. The reset below is confirmed by polling, so only that crash is let through.
    if (String(e.stderr).includes("UV_HANDLE_CLOSING")) return String(e.stdout ?? "").trim();
    throw e;
  }
};

const browser = await launch();
const ctx = await signedInContext(browser);
const page = await ctx.newPage();
await page.goto(`${BASE}/today`);
await settle(page);
const userId = await page.evaluate(() => window.Clerk?.user?.id);
if (!userId) throw new Error("Not signed in: no Clerk user on the page.");

saveUser(userId);
const op = (name, input) => apiOp(name, input, userId);

// Reset: delete everything the test user owns, then wait until it's gone.
const issuer = convex("env", "get", "CLERK_JWT_ISSUER_DOMAIN");
convex("run", "account:deleteDataBatch", JSON.stringify({ ownerId: `${issuer}|${userId}` }));
for (let i = 0; ; i++) {
  if (!(await op("list_spaces")).length) break;
  if (i > 20) throw new Error("Reset didn't finish.");
  await new Promise((r) => setTimeout(r, 500));
}
// Opening the app recreates the profile with the browser's time zone, so "today" matches.
await page.reload();
await settle(page);
console.log(`reset    ${userId}`);

if (!process.argv.includes("--reset")) {
  const space = async (name, color, parentId) =>
    (await op("add_space", { name, color, ...(parentId ? { parentId } : {}) })).spaceId;
  // Distinct colours, as people pick them, so a block that ignores its space's colour shows.
  const work = await space("Work", "blue");
  await space("Kriyan", "blue", work);
  await space("Clients", "pink", work);
  const school = await space("School", "green");
  const calculus = await space("Calculus", "purple", school);
  await space("Physics", "teal", school);
  const life = await space("Life", "orange");

  const sentences = [
    "Write MCP tools today 10:00 for 1h30 #work/kriyan",
    "Book the dentist today #life",
    "Run every 2 days after done #life",
    "Read chapter 7.4 today 22:00 #school/physics",
    "Calculus II lecture every tue and thu 9am for 1h30 #school/calculus",
    "Mum's birthday 16 oct every year remind day before at 20:00 #life",
    "Send the invoice tomorrow #work/clients",
    "Problem set 4 due fri #school/calculus",
    "Look into standing desks",
  ];
  for (const text of sentences) await op("add_task", { text });
  console.log(`seeded   7 spaces, ${sentences.length} tasks`);

  // Design v5's routines, goals and a study session, with a few weeks of history behind them.
  const today = (await op("get_today")).date;
  const day = (offset) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const goal = async (fields, log) => {
    const { goalId } = await op("add_goal", { kind: "number", spaceId: life, ...fields });
    for (const [offset, value] of log) await op("log_goal", { goalId, value, date: day(offset) });
    return goalId;
  };
  // Kilos lost so far, so the bar fills as the weight comes down.
  const weight = await goal({ title: "Lose 5 kg", target: 5, unit: "kg", dueDate: day(68) }, [
    [-28, 0],
    [-21, 0.3],
    [-14, 0.8],
    [-7, 1.1],
    [0, 1.4],
  ]);
  const savings = await goal({ title: "Save $2,000", target: 2000, unit: "$", dueDate: day(67) }, [
    [-54, 300],
    [-24, 900],
    [-2, 1240],
  ]);
  const meditate = (await op("add_habit", { title: "Meditate", target: 7, spaceId: life })).habitId;
  const gym = (await op("add_habit", { title: "Gym", target: 4, spaceId: life, goalId: weight })).habitId;
  const morning = (
    await op("add_routine", {
      title: "Morning routine",
      time: 7 * 60,
      spaceId: life,
      parts: [
        { title: "Brush teeth", length: 5 },
        { title: "Meditate", length: 10, habitId: meditate },
        { title: "Gym", length: 45, habitId: gym, weekdays: [0, 2, 4, 5] },
        { title: "Cold plunge", length: 5 },
        { title: "Shower", length: 10 },
      ],
    })
  ).routineId;
  const night = (
    await op("add_routine", {
      title: "Night routine",
      time: 22 * 60,
      spaceId: life,
      parts: [
        { title: "Read", length: 20 },
        { title: "Brush teeth", length: 5 },
        { title: "Lay out tomorrow's clothes", length: 5 },
      ],
    })
  ).routineId;
  // A six-day morning streak and three nights; this morning is two parts in.
  for (let offset = -6; offset < 0; offset++)
    await op("tick_routine", { routineId: morning, done: true, date: day(offset) });
  for (let offset = -3; offset < 0; offset++)
    await op("tick_routine", { routineId: night, done: true, date: day(offset) });
  for (const index of [0, 1])
    await op("tick_routine", { routineId: morning, index, done: true, date: today });
  await op("add_task", {
    title: "Move $100 to savings",
    spaceId: life,
    goalId: savings,
    date: today,
    repeat: { freq: "week", interval: 1 },
  });

  const exam = await op("add_task", {
    title: "Calculus exam 2",
    spaceId: calculus,
    date: day(7),
    time: 13 * 60 + 30,
    length: 75,
    event: true,
  });
  await op("add_task", {
    title: "Study for Calculus exam 2",
    spaceId: calculus,
    date: today,
    time: 16 * 60,
    length: 60,
    repeat: { freq: "day", interval: 1, end: { kind: "on", date: day(6) } },
    prepFor: exam.taskId,
    steps: [
      { title: "Limits and continuity", done: true },
      { title: "Derivatives", done: false },
      { title: "Integration by parts", done: false },
      { title: "Practice exam", done: false },
    ],
  });
  console.log("seeded   2 routines, 2 habits, 2 goals with entries, a study session for an exam in 7 days");
}
await browser.close();

// Planning the week from the tray (after `seed.mjs`): drag an Inbox task onto a day's header
// (that day, no time), and an undated task onto the grid (that day, at a time). Undo puts it
// back. Then hide the tray. Prints ok or FAIL per step; screenshots go to .artifacts/app/.

import { addDays } from "@kriyan/core/dates";
import { formatDay } from "@kriyan/core/format";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";
import { op } from "./api.mjs";

const failures = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${String(e).split("\n")[0]}`);
  }
};

const today = (await op("get_today", {})).date;
const week = await op("get_week", {});
const dayIndex = (date) => week.days.findIndex((d) => d.date === date);
// Two days ahead within this week, or the week's last day.
const target = week.days.find((d) => d.date === addDays(today, 2))?.date ?? week.days[6].date;
const taskOn = (date, title) => {
  const day = week.days.find((d) => d.date === date);
  return day ? [...day.anytime, ...day.scheduled].find((t) => t.title === title) : undefined;
};

const browser = await launch();
const ctx = await signedInContext(browser, { width: 1440, height: 900 });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
await page.goto(`${BASE}/upcoming`);
await settle(page);
const status = page.getByRole("status");
const tray = page.getByLabel("To plan", { exact: true });

/** Drags a tray row to a point in the week, a step at a time like a hand would. */
const drag = async (title, to) => {
  const from = await tray.getByRole("button", { name: `Open ${title}` }).boundingBox();
  await page.mouse.move(from.x + 40, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++)
    await page.mouse.move(
      from.x + 40 + ((to.x - from.x - 40) * i) / 15,
      from.y + from.height / 2 + ((to.y - from.y - from.height / 2) * i) / 15,
    );
  await page.waitForTimeout(200);
};

// Where a day's column is: its header names the weekday.
const column = async (date) => {
  const label = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][
    dayIndex(date)
  ];
  return page.getByLabel(label, { exact: true }).boundingBox();
};

await step("the tray lists the Inbox and undated tasks", async () => {
  await tray.getByRole("button", { name: "Open Look into standing desks" }).waitFor();
  await tray.getByRole("button", { name: "Open Problem set 4" }).waitFor();
  await page.screenshot({ path: artifact("plan-tray-1440.png") });
});

await step("drop on a day's header: the task lands on that day with no time", async () => {
  const head = await column(target);
  await drag("Look into standing desks", { x: head.x + 30, y: head.y + 30 });
  await page.screenshot({ path: artifact("plan-drop-day-1440.png") });
  await page.mouse.up();
  await status
    .filter({ hasText: `Moved to ${formatDay(target, today)}: Look into standing desks` })
    .waitFor();
  const after = await op("get_week", {});
  const day = after.days.find((d) => d.date === target);
  const t = day.anytime.find((x) => x.title === "Look into standing desks");
  if (!t) throw new Error(`not among ${target}'s anytime tasks`);
  if (t.time !== null) throw new Error(`it got a time: ${t.time}`);
});

await step("Undo sends it back to the Inbox", async () => {
  await status.filter({ hasText: "Look into standing desks" }).getByRole("button", { name: "Undo" }).click();
  await tray.getByRole("button", { name: "Open Look into standing desks" }).waitFor();
  const inbox = await op("get_inbox", {});
  if (!JSON.stringify(inbox).includes("Look into standing desks")) throw new Error("not back in the Inbox");
});

await step("drop on the grid: the task lands on that day at the time under the pointer", async () => {
  const head = await column(target);
  const hour = await page.getByText("14:00", { exact: true }).first().boundingBox();
  await drag("Problem set 4", { x: head.x + 30, y: hour.y + hour.height / 2 + 2 });
  await page.screenshot({ path: artifact("plan-drop-time-1440.png") });
  await page.mouse.up();
  await status.filter({ hasText: `Moved to ${formatDay(target, today)}: Problem set 4` }).waitFor();
  const after = await op("get_week", {});
  const t = after.days.find((d) => d.date === target).scheduled.find((x) => x.title === "Problem set 4");
  if (!t) throw new Error(`not scheduled on ${target}`);
  if (t.time !== 14 * 60) throw new Error(`time is ${t.time}, expected 840`);
  await page.screenshot({ path: artifact("plan-after-1440.png") });
});

await step("the tray hides and comes back from the page head", async () => {
  await page.getByRole("button", { name: "Hide tasks to plan" }).click();
  await tray.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Show tasks to plan" }).click();
  await tray.waitFor();
});

if (taskOn(target, "Problem set 4"))
  console.log("note: Problem set 4 was already on that day before the run");
await browser.close();
console.log(`plan-week: ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);

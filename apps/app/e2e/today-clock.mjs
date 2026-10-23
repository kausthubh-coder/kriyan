// Today at three times of the seeded day, with the browser's clock faked:
// - 14:00: a block that slipped (10:00 "Write MCP tools", not done) stays on the schedule
//   instead of folding away under "Earlier today".
// - 10:15: two blocks overlap; Now shows the running one and Next the other running one.
// - 20:30 at 390: the 30-minute 22:00 block shows its title alone, not two clipped lines.
// - On "Problem set 4"'s due day: a task due that day with no day of its own is on the list.
// Run after seed.mjs. Prints ok or FAIL per step; screenshots go to .artifacts/app/.
//   node apps/app/e2e/today-clock.mjs

import { todayIn } from "@kriyan/core/dates";
import { op } from "./api.mjs";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const today = todayIn(zone);
const at = (hhmm) => new Date(`${today}T${hhmm}:00`);

const browser = await launch();

async function open(viewport, hhmm) {
  const ctx = await signedInContext(browser, viewport);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.clock.setFixedTime(at(hhmm));
  await page.goto(`${BASE}/today`);
  await settle(page);
  return { ctx, page };
}

{
  const { ctx, page } = await open({ width: 1440, height: 900 }, "14:00");
  const block = page.getByRole("button", { name: /^Open Write MCP tools, 10:00/ });
  check((await block.count()) > 0, "14:00: the slipped 10:00 block is still on the schedule");
  await page.screenshot({ path: artifact("today-clock-1400-1440.png") });
  await ctx.close();
}

{
  // The seeded lecture repeats only on Tue and Thu; on other days give today the same overlap.
  const plan = await op("get_today");
  if (!JSON.stringify(plan).includes("Calculus II lecture")) {
    await op("add_task", { text: "Calculus II lecture today 9am for 1h30 #school/calculus" });
  }
  const { ctx, page } = await open({ width: 1440, height: 900 }, "10:15");
  const now = (await page.getByLabel("Now", { exact: true }).first().innerText()).replace(/\s+/g, " ");
  check(/→ 10:30/.test(now) && /Calculus II lecture/.test(now), `10:15: Now is the lecture (${now})`);
  check(
    /Then Write MCP tools, until 11:30/.test(now),
    "10:15: Next is the block already running, until 11:30",
  );
  await page.screenshot({ path: artifact("today-clock-1015-1440.png") });
  await ctx.close();
}

{
  const { ctx, page } = await open({ width: 390, height: 844 }, "20:30");
  // The phone opens Today as a list; the block lives on the timeline.
  await page.getByText("Timeline", { exact: true }).click();
  const block = page.getByRole("button", { name: /^Open Read chapter 7\.4, 22:00/ });
  await block.scrollIntoViewIfNeeded();
  const text = (await block.innerText()).trim();
  check(text === "Read chapter 7.4", `20:30 at 390: the short block shows its title alone ("${text}")`);
  await block.screenshot({ path: artifact("today-clock-2030-390-block.png") });
  await page.screenshot({ path: artifact("today-clock-2030-390.png") });
  await ctx.close();
}

{
  // "Problem set 4 due fri" has a deadline and no day of its own: on its due day it's on Today.
  const week = await op("get_week");
  const due = week.days.flatMap((d) => d.deadlines).find((t) => t.title === "Problem set 4");
  if (!due) throw new Error("No Problem set 4 this week: run seed.mjs first.");
  const ctx = await signedInContext(browser, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.clock.setFixedTime(new Date(`${due.deadline}T08:30:00`));
  await page.goto(`${BASE}/today`);
  await settle(page);
  const row = page.getByRole("button", { name: "Open Problem set 4", exact: true });
  check((await row.count()) === 1, `${due.deadline} 08:30: Problem set 4, due that day, is on Today's list`);
  const facts = (await row.innerText()).replace(/\s+/g, " ");
  check(/Due Today/.test(facts), `${due.deadline} 08:30: its row says "Due Today" (${facts})`);
  await page.screenshot({ path: artifact("today-clock-due-1440.png") });
  await ctx.close();
}

await browser.close();
console.log(`today-clock: ${failed ? `${failed} failing` : "0 failing"}`);
process.exit(failed ? 1 : 0);

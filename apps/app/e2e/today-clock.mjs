// v5's Today at fixed times of the seeded day, with the browser's clock faked:
// - 14:00: a block that slipped (10:00 "Write MCP tools", not done) stays in the day, quieter.
// - 10:15: two blocks overlap; both say "● Now" and carry the red now line.
// - 12:00: the free stretch you're in is red ("Now, … free until 16:00") and stretches already
//   over are gone.
// - 20:30 at 390: the 22:00 item with no length is a thin row with its time and whole title
//   (never an invented length).
// - On "Problem set 4"'s due day: a task due that day with no day of its own is in To fit in.
// Run after seed.mjs. Prints ok or FAIL per step; screenshots go to .artifacts/app/.
//   node apps/app/e2e/today-clock.mjs

import { addDays, todayIn } from "@kriyan/core/dates";
import { op } from "./api.mjs";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const today = todayIn(zone);
const at = (hhmm, day = today) => new Date(`${day}T${hhmm}:00`);

const browser = await launch();

async function open(viewport, hhmm, day) {
  const ctx = await signedInContext(browser, viewport);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.clock.setFixedTime(at(hhmm, day));
  await page.goto(`${BASE}/today`);
  await settle(page);
  return { ctx, page };
}

{
  const { ctx, page } = await open({ width: 1440, height: 900 }, "14:00");
  const block = page.getByRole("button", { name: /^Open Write MCP tools, 10:00/ });
  check((await block.count()) > 0, "14:00: the slipped 10:00 block is still in the day");
  const opacity = Number(await block.first().evaluate((el) => getComputedStyle(el).opacity));
  check(opacity < 1, `14:00: it's quieter now it's over (opacity ${opacity})`);
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
  for (const name of [/^Open Calculus II lecture, 09:00–10:30/, /^Open Write MCP tools, 10:00–11:30/]) {
    const block = page.getByRole("button", { name }).first();
    const text = (await block.innerText()).replace(/\s+/g, " ");
    check(/Now/.test(text), `10:15: ${String(name).slice(7, 30)}… says Now (${text})`);
  }
  await page.screenshot({ path: artifact("today-clock-1015-1440.png") });
  await ctx.close();
}

{
  const { ctx, page } = await open({ width: 390, height: 844 }, "12:00");
  const now = page.getByRole("button", { name: /^Now, .* free until 16:00\. Fill 12:00–16:00$/ });
  check((await now.count()) === 1, "12:00: the stretch you're in is red, from now until 16:00");
  const early = page.getByRole("button", { name: /Fill 08:00–10:00$/ });
  check((await early.count()) === 0, "12:00: the morning's free stretch, already over, is gone");
  await page.screenshot({ path: artifact("today-clock-1200-390.png") });
  await ctx.close();
}

{
  const { ctx, page } = await open({ width: 390, height: 844 }, "20:30");
  const row = page.getByRole("button", { name: "Open Read chapter 7.4, 22:00", exact: true });
  await row.scrollIntoViewIfNeeded();
  const text = (await row.innerText()).replace(/\s+/g, " ").trim();
  check(/^Read chapter 7\.4/.test(text) && !/–/.test(text), `20:30 at 390: a thin row, no length (${text})`);
  const clipped = await row
    .getByText("Read chapter 7.4", { exact: false })
    .first()
    .evaluate((el) => el.scrollWidth > el.clientWidth);
  check(!clipped, "20:30 at 390: the title is not cut off");
  await page.screenshot({ path: artifact("today-clock-2030-390.png") });
  await ctx.close();
}

{
  // "Problem set 4 due fri" has a deadline and no day of its own: on its due day it's on Today.
  const week = await op("get_range", { start: today, end: addDays(today, 7) });
  const due = week.days.flatMap((d) => d.deadlines).find((t) => t.title === "Problem set 4");
  if (!due) throw new Error("No Problem set 4 in the next 7 days: run seed.mjs first.");
  const { ctx, page } = await open({ width: 1440, height: 900 }, "08:30", due.deadline);
  const chip = page.getByRole("button", { name: /^Fit in Problem set 4, due (today|\d\d:\d\d)$/ });
  check((await chip.count()) === 1, `${due.deadline} 08:30: Problem set 4, due that day, is in To fit in`);
  await page.screenshot({ path: artifact("today-clock-due-1440.png") });
  await ctx.close();
}

await browser.close();
console.log(`today-clock: ${failed ? `${failed} failing` : "0 failing"}`);
process.exit(failed ? 1 : 0);

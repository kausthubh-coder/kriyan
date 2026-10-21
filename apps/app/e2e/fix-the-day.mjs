// Fixing a day that slipped, the way a person does it (after `seed.mjs`):
//   desktop: hover a row, move it to tomorrow, Undo; pick a day from the row; close the day, Undo;
//   phone: swipe left to see the actions, a long swipe left moves, a long swipe right ticks off.
// Prints ok or FAIL per step and saves a screenshot of each state to .artifacts/app/.

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
const expectEq = (actual, expected, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const anytimeTitles = async () => (await op("get_today", {})).anytime.map((t) => t.title).sort();

const browser = await launch();
const today = (await op("get_today", {})).date;
const tomorrow = addDays(today, 1);

// Desktop.
{
  const ctx = await signedInContext(browser, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}/today`);
  await settle(page);
  const status = page.getByRole("status");

  await step("hover a row: Tomorrow moves it, the toast names it, Undo brings it back", async () => {
    await page.getByRole("button", { name: "Open Book the dentist" }).hover();
    await page.screenshot({ path: artifact("fix-hover-1440.png") });
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await status.filter({ hasText: "Moved to Tomorrow: Book the dentist" }).waitFor();
    await page.getByRole("button", { name: "Open Book the dentist" }).waitFor({ state: "detached" });
    expectEq((await anytimeTitles()).includes("Book the dentist"), false, "after the move");
    await status.filter({ hasText: "Book the dentist" }).getByRole("button", { name: "Undo" }).click();
    await page.getByRole("button", { name: "Open Book the dentist" }).waitFor();
    expectEq((await anytimeTitles()).includes("Book the dentist"), true, "after Undo");
  });

  await step("hover a row: Pick a day opens a calendar and moves it there", async () => {
    await page.mouse.move(0, 0);
    await page.getByRole("button", { name: "Open Run" }).hover();
    await page.getByRole("button", { name: "Pick a day" }).click();
    const dialog = page.getByRole("dialog", { name: "Move to a day" });
    await dialog.waitFor();
    await page.screenshot({ path: artifact("fix-pick-1440.png") });
    const target = addDays(today, 2);
    await dialog
      .getByRole("button", { name: formatDay(target, today), exact: true })
      .first()
      .click();
    await status.filter({ hasText: `Moved to ${formatDay(target, today)}: Run` }).waitFor();
    await status.filter({ hasText: "Run" }).getByRole("button", { name: "Undo" }).click();
    await page.getByRole("button", { name: "Open Run" }).waitFor();
  });

  await step("close the day: everything open today goes to tomorrow, Undo puts it back", async () => {
    await page.mouse.move(0, 0);
    const row = page.getByText(/still open today$/);
    await row.waitFor();
    const count = Number((await row.innerText()).split(" ")[0]);
    await page.screenshot({ path: artifact("fix-close-day-before-1440.png") });
    await page.getByRole("button", { name: "Move to tomorrow" }).click();
    await status.filter({ hasText: `Moved ${count} to Tomorrow` }).waitFor();
    await row.waitFor({ state: "detached" });
    await page.screenshot({ path: artifact("fix-close-day-after-1440.png") });
    const week = await op("get_week", { start: today });
    const next = week.days.find((d) => d.date === tomorrow);
    const there = [...next.anytime, ...next.scheduled].map((t) => t.title);
    for (const title of ["Book the dentist", "Run", "Read chapter 7.4"])
      if (!there.includes(title)) throw new Error(`${title} is not on ${tomorrow}: ${there.join(", ")}`);
    await status
      .filter({ hasText: `Moved ${count} to Tomorrow` })
      .getByRole("button", { name: "Undo" })
      .click();
    await row.waitFor();
    expectEq(await anytimeTitles(), ["Book the dentist", "Run"], "anytime after Undo");
  });

  await step("the command menu has Close the day", async () => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type("close");
    await page.getByRole("dialog", { name: "Command menu" }).getByText("Close the day").waitFor();
    await page.screenshot({ path: artifact("fix-command-1440.png") });
    await page.keyboard.press("Escape");
  });
  await ctx.close();
}

// Phone.
{
  const ctx = await signedInContext(browser, { width: 390, height: 844 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}/today`);
  await settle(page);
  const status = page.getByRole("status");
  const swipe = async (name, dx) => {
    const box = await page.getByRole("button", { name: `Open ${name}` }).boundingBox();
    const y = box.y + box.height / 2;
    const x = dx < 0 ? 300 : 120;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(x + (dx * i) / 12, y + i * 0.2);
    return async () => {
      await page.mouse.up();
    };
  };

  await step("phone: a short swipe left shows Tomorrow and Pick a day", async () => {
    const release = await swipe("Book the dentist", -150);
    await release();
    await page.waitForTimeout(500);
    await page.screenshot({ path: artifact("fix-swipe-open-390.png") });
    await page.getByRole("button", { name: "Pick a day" }).click();
    await page.getByRole("dialog", { name: "Move to a day" }).waitFor();
    await page.screenshot({ path: artifact("fix-swipe-pick-390.png") });
    await page.keyboard.press("Escape");
  });

  await step("phone: opening a second row closes the first", async () => {
    await page.waitForTimeout(400);
    const first = await swipe("Book the dentist", -150);
    await first();
    await page.waitForTimeout(500);
    const second = await swipe("Run", -150);
    await second();
    await page.waitForTimeout(700);
    const open = await page.getByRole("button", { name: "Pick a day" }).count();
    if (open !== 1) throw new Error(`${open} rows show their actions`);
    await page.screenshot({ path: artifact("fix-swipe-second-390.png") });
    await page.getByRole("button", { name: "Close actions" }).click();
  });

  await step("phone: a long swipe left moves it to tomorrow", async () => {
    await page.waitForTimeout(400);
    const release = await swipe("Book the dentist", -260);
    await page.screenshot({ path: artifact("fix-swipe-armed-390.png") });
    await release();
    await status.filter({ hasText: "Moved to Tomorrow: Book the dentist" }).waitFor();
    await status.filter({ hasText: "Book the dentist" }).getByRole("button", { name: "Undo" }).click();
    await page.getByRole("button", { name: "Open Book the dentist" }).waitFor();
  });

  await step("phone: a long swipe right ticks it off", async () => {
    await page.waitForTimeout(600);
    const release = await swipe("Book the dentist", 220);
    await page.screenshot({ path: artifact("fix-swipe-done-armed-390.png") });
    await release();
    await status.filter({ hasText: "Done: Book the dentist" }).waitFor();
    await status.filter({ hasText: "Done: Book the dentist" }).getByRole("button", { name: "Undo" }).click();
  });
  await ctx.close();
}

await browser.close();
console.log(`fix-the-day: ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);

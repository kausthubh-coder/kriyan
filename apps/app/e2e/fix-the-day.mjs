// Fixing a day that slipped, the way a person does it on v5's Today (after `seed.mjs`). It
// switches Today to the list layout (one line per item, where the swipes live) and back:
//   desktop: select a row, Tomorrow in the right panel moves it, Undo; Edit's Day picker moves a
//   task to another day; close the day from the command menu, Undo;
//   phone: swipe left to see the actions, a long swipe left moves, a long swipe right ticks off.
// Prints ok or FAIL per step and saves a screenshot of each state to .artifacts/app/.

import { addDays } from "@kriyan/core/dates";
import { formatDate } from "@kriyan/core/format";
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
const dateOf = async (title) =>
  JSON.stringify(await op("search_tasks", { text: title })).match(/"date":"(\d{4}-\d{2}-\d{2})"/)?.[1];

const browser = await launch();
const today = (await op("get_today", {})).date;
const tomorrow = addDays(today, 1);
await op("update_settings", { todayLayout: "list" });

// Desktop.
{
  const ctx = await signedInContext(browser, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}/`);
  await settle(page);
  const status = page.getByRole("status");
  const row = (title) =>
    page.getByRole("button", { name: `Open ${title}`, exact: true }).filter({ visible: true });
  const panel = page.getByRole("complementary", { name: "Details" });

  await step(
    "select a row: Tomorrow in the panel moves it, the toast names it, Undo brings it back",
    async () => {
      await row("Book the dentist").click();
      await panel.waitFor();
      await page.screenshot({ path: artifact("fix-panel-1440.png") });
      await panel.getByRole("button", { name: "Tomorrow", exact: true }).click();
      await status.filter({ hasText: "Moved to tomorrow: Book the dentist" }).waitFor();
      await row("Book the dentist").waitFor({ state: "detached" });
      expectEq((await anytimeTitles()).includes("Book the dentist"), false, "after the move");
      await status.filter({ hasText: "Book the dentist" }).getByRole("button", { name: "Undo" }).click();
      await row("Book the dentist").waitFor();
      expectEq((await anytimeTitles()).includes("Book the dentist"), true, "after Undo");
    },
  );

  await step("Edit's Day picker moves a task to another day", async () => {
    const target = addDays(today, 2);
    await row("Run").click();
    await panel.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit Run" });
    await edit.waitFor();
    await edit.getByRole("button", { name: /^Day/ }).click();
    const picker = page.getByRole("dialog", { name: "Day" });
    await picker.waitFor();
    await page.screenshot({ path: artifact("fix-pick-1440.png") });
    await picker
      .getByRole("button", { name: formatDate(target), exact: true })
      .first()
      .click();
    await page.waitForTimeout(800);
    expectEq(await dateOf("Run"), target, "Run's day after the pick");
    // Back to today the same way.
    await edit.getByRole("button", { name: /^Day/ }).click();
    await page
      .getByRole("dialog", { name: "Day" })
      .getByRole("button", { name: formatDate(today), exact: true })
      .first()
      .click();
    await page.waitForTimeout(800);
    expectEq(await dateOf("Run"), today, "Run's day after picking today");
    await edit.getByRole("button", { name: "Done", exact: true }).first().click();
  });

  await step("close the day: everything open today goes to tomorrow, Undo puts it back", async () => {
    // v5's evening review row leads to Review; the one-step move lives in the command menu.
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("close the day");
    await page.getByRole("dialog", { name: "Command menu" }).getByText("Close the day").click();
    const moved = status.filter({ hasText: /^Moved \d+ to tomorrow/ });
    await moved.waitFor();
    await page.screenshot({ path: artifact("fix-close-day-after-1440.png") });
    const week = await op("get_week", { start: today });
    const next = week.days.find((d) => d.date === tomorrow);
    const there = [...next.anytime, ...next.scheduled].map((t) => t.title);
    for (const title of ["Book the dentist", "Run", "Read chapter 7.4"])
      if (!there.includes(title)) throw new Error(`${title} is not on ${tomorrow}: ${there.join(", ")}`);
    expectEq(
      (await anytimeTitles()).filter((t) => !/savings/.test(t)),
      [],
      "anytime after closing the day",
    );
    await moved.getByRole("button", { name: "Undo" }).click();
    await row("Run").waitFor();
    expectEq(
      (await anytimeTitles()).filter((t) => !/savings/.test(t)),
      ["Book the dentist", "Run"],
      "anytime after Undo",
    );
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
  await page.goto(`${BASE}/`);
  await settle(page);
  const status = page.getByRole("status");
  const swipe = async (name, dx) => {
    const target = page.getByRole("button", { name: `Open ${name}`, exact: true }).filter({ visible: true });
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
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
    await status.filter({ hasText: "Moved to tomorrow: Book the dentist" }).waitFor();
    await status.filter({ hasText: "Book the dentist" }).getByRole("button", { name: "Undo" }).click();
    await page
      .getByRole("button", { name: "Open Book the dentist", exact: true })
      .filter({ visible: true })
      .waitFor();
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

await op("update_settings", { todayLayout: "blocks" });
await browser.close();
console.log(`fix-the-day: ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);

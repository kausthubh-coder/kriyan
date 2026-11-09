// To fit in as a checklist (after `seed.mjs`): tick a task off before fitting it; on desktop,
// drag one onto a free stretch, which says where it will land, and it becomes a block at that
// time (one without a length opens Fill there instead); past four rows, "2 more" unfolds the rest
// and "Show fewer" folds them again. Prints ok or FAIL per step; screenshots in .artifacts/app/.

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

const { date: today } = await op("get_today", {});
const add = async (body) => (await op("add_task", body)).task._id;
await add({ title: "Read chapter 4", date: today, length: 45 });
await add({ title: "Call the bank", date: today });
await add({ title: "Buy groceries", date: today });
// Enough to fold: four rows show, the rest wait behind "N more".
await add({ title: "Water the plants", date: today });
await add({ title: "Renew the bus pass", date: today });
const find = async (title) => {
  const day = await op("get_today", {});
  return [...day.scheduled, ...day.anytime, ...day.done].find((t) => t.title === title);
};

const browser = await launch();
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const ctx = await signedInContext(browser, { width: w, height: h });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}/today`);
  await settle(page);
  const card = page.getByLabel(/^To fit in, \d+$/);
  const all = card.getByRole("button", { name: /^\d+ more$/ });
  if (await all.count()) await all.click();

  if (w === 1440) {
    await step(`${w}: dragging a task with a length onto a free stretch puts it there`, async () => {
      const row = card.getByRole("button", { name: /^Fit in Read chapter 4,/ });
      const gap = page.getByRole("button", { name: /free\. Fill \d\d:\d\d–\d\d:\d\d$/ }).first();
      await gap.scrollIntoViewIfNeeded();
      await row.scrollIntoViewIfNeeded();
      const from = await row.boundingBox();
      await page.mouse.move(from.x + 40, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 60, from.y + from.height / 2 + 10, { steps: 4 });
      const to = await gap.boundingBox();
      await page.mouse.move(to.x + 60, to.y + 2, { steps: 12 });
      const landing = page.getByText(/^Put it at \d\d:\d\d–\d\d:\d\d$/);
      await landing.waitFor();
      const range = (await landing.textContent()).replace("Put it at ", "");
      await page.screenshot({ path: artifact(`fit-in-drag-${w}.png`) });
      await page.mouse.up();
      await page
        .getByRole("status")
        .filter({ hasText: `Read chapter 4, ${range}` })
        .waitFor();
      const placed = await find("Read chapter 4");
      const [hh, mm] = range.split("–")[0].split(":").map(Number);
      if (placed?.time !== hh * 60 + mm || placed.length !== 45)
        throw new Error(`expected ${range}, got ${JSON.stringify([placed?.time, placed?.length])}`);
      await page.screenshot({ path: artifact(`fit-in-dropped-${w}.png`) });
    });

    await step(`${w}: dropping one without a length opens Fill at that time`, async () => {
      const row = card.getByRole("button", { name: /^Fit in Call the bank,/ });
      await row.scrollIntoViewIfNeeded();
      const from = await row.boundingBox();
      await page.mouse.move(from.x + 40, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 60, from.y + from.height / 2 + 10, { steps: 4 });
      const gap = page.getByRole("button", { name: /free\. Fill \d\d:\d\d–\d\d:\d\d$/ }).first();
      const to = await gap.boundingBox();
      await page.mouse.move(to.x + 60, to.y + 2, { steps: 12 });
      const landing = page.getByText(/^Put it at \d\d:\d\d$/);
      await landing.waitFor();
      const at = (await landing.textContent()).replace("Put it at ", "");
      await page.mouse.up();
      const fill = page.getByRole("dialog", { name: "Fill free time" });
      await fill.getByText(new RegExp(`^Fill ${at}–`)).waitFor();
      const picked = fill.getByRole("radio", { name: "Call the bank" });
      if ((await picked.getAttribute("aria-checked")) !== "true") throw new Error("not picked");
      await page.screenshot({ path: artifact(`fit-in-drop-fill-${w}.png`) });
      await page.keyboard.press("Escape");
      await fill.waitFor({ state: "detached" });
    });
  }

  await step(`${w}: ticking one in the card finishes it`, async () => {
    const box = card.getByRole("checkbox", { name: "Complete: Buy groceries" });
    if (!(await box.count())) throw new Error("no tick for Buy groceries");
    await box.click();
    await page.screenshot({ path: artifact(`fit-in-tick-${w}.png`) });
    await card.getByRole("button", { name: /^Fit in Buy groceries,/ }).waitFor({ state: "detached" });
    if (!(await find("Buy groceries"))?.done) throw new Error("not done");
    await op("reopen_task", { taskId: (await find("Buy groceries"))._id });
  });

  await step(`${w}: past four rows, the last row unfolds the rest and folds them again`, async () => {
    const less = card.getByRole("button", { name: "Show fewer" });
    if (await less.count()) await less.click();
    const rows = card.getByRole("button", { name: /^Fit in / });
    const total = Number((await card.getAttribute("aria-label")).replace(/\D/g, ""));
    if (total <= 4) throw new Error(`only ${total} to fit in; the fold needs 5 or more`);
    if ((await rows.count()) !== 4) throw new Error(`folded shows ${await rows.count()} rows`);
    const more = card.getByRole("button", { name: `${total - 4} more` });
    await card.screenshot({ path: artifact(`fit-in-folded-${w}.png`) });
    await more.click();
    if ((await rows.count()) !== total) throw new Error(`unfolded shows ${await rows.count()} of ${total}`);
    await card.screenshot({ path: artifact(`fit-in-unfolded-${w}.png`) });
    await less.click();
    await more.waitFor();
    if ((await rows.count()) !== 4) throw new Error("Show fewer didn't fold it");
  });
  await ctx.close();
}
await browser.close();
console.log(`fit-in: ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);

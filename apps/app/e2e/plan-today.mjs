// Plan today (after `seed.mjs`): a task left from yesterday is picked by default, an Inbox task
// can be added, the sheet says how it fits the free time, "Add" brings them to today, and Undo
// puts them back. At 1440 and 390. Prints ok or FAIL per step; screenshots in .artifacts/app/.

import { addDays } from "@kriyan/core/dates";
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
await op("add_task", { title: "Return the library books", date: addDays(today, -1) });
await op("add_task", { text: "Tidy the desk for 30m" });
const anytime = async () => (await op("get_today", {})).anytime.map((t) => t.title);

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
  const sheet = page.getByRole("dialog", { name: "Plan today" });

  await step(`${w}: Plan today opens with yesterday's task picked and the Inbox to choose from`, async () => {
    await page.getByRole("button", { name: "Plan today" }).click();
    await sheet.waitFor();
    const books = sheet.getByRole("checkbox", { name: "Bring to today: Return the library books" });
    const desk = sheet.getByRole("checkbox", { name: "Bring to today: Tidy the desk" });
    if ((await books.getAttribute("aria-checked")) !== "true")
      throw new Error("yesterday's task isn't picked");
    if ((await desk.getAttribute("aria-checked")) !== "false")
      throw new Error("the Inbox task is picked already");
    await desk.click();
    await sheet.getByText(/^30 min of the .* free$/).waitFor();
    await page.screenshot({ path: artifact(`plan-today-${w}.png`) });
  });

  await step(`${w}: Add brings both to today, Undo puts them back`, async () => {
    await sheet.getByRole("button", { name: "Add 2 to today" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Moved 2 to Today" });
    await toast.waitFor();
    const now = await anytime();
    for (const t of ["Return the library books", "Tidy the desk"])
      if (!now.includes(t)) throw new Error(`${t} isn't on today: ${now.join(", ")}`);
    await toast.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(800);
    const back = await anytime();
    if (back.includes("Tidy the desk")) throw new Error("Undo left the Inbox task on today");
    const inbox = JSON.stringify(await op("get_inbox", {}));
    if (!inbox.includes("Tidy the desk")) throw new Error("Undo didn't return it to the Inbox");
  });
  await ctx.close();
}
await browser.close();
console.log(`plan-today: ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);

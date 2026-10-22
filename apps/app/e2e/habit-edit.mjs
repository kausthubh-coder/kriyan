// Editing a habit on Progress: rename it and change its times a week, then archive it (it
// leaves Today's check-ins) and bring it back with the toast's Undo. At 1440, with a 390 look.
// Run after seed.mjs. Prints ok or FAIL per step; screenshots go to .artifacts/app/.
//   node apps/app/e2e/habit-edit.mjs

import { op } from "./api.mjs";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const habits = async () => (await op("get_today")).habits.map((h) => [h.title, h.target]);

const { habitId } = await op("add_habit", { title: "Raed 20 min", target: 4 });
await op("check_habit", { habitId, done: true });

const browser = await launch();
const ctx = await signedInContext(browser, { width: 1440, height: 900 });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
await page.goto(`${BASE}/progress`);
await settle(page);

await page.getByRole("button", { name: "Edit habit" }).click();
const field = page.getByRole("textbox", { name: "Habit" });
await field.fill("Read 20 min");
await page.getByRole("button", { name: "5 times a week" }).click();
await page.screenshot({ path: artifact("habit-edit-1440.png") });
await page.getByRole("button", { name: "Save habit" }).click();
await page.getByText("5 times a week, ").first().waitFor();
check(
  JSON.stringify(await habits()) === JSON.stringify([["Read 20 min", 5]]),
  `1440: renamed and retargeted (get_today: ${JSON.stringify(await habits())})`,
);

await page.getByRole("button", { name: "Edit habit" }).click();
await page.getByRole("button", { name: "Archive habit" }).click();
const toast = page.getByRole("status").filter({ hasText: "Archived: Read 20 min" });
await toast.waitFor();
check((await habits()).length === 0, "1440: archived, it's gone from Today's check-ins");
await page.screenshot({ path: artifact("habit-archived-1440.png") });
await toast.getByRole("button", { name: "Undo" }).click();
await page.getByText("Read 20 min").first().waitFor();
const back = (await op("get_today")).habits;
check(
  back.length === 1 && back[0].title === "Read 20 min" && back[0].doneToday,
  "1440: Undo brings it back, with today's check",
);
await ctx.close();

const phone = await signedInContext(browser, { width: 390, height: 844 });
const p = await phone.newPage();
await p.goto(`${BASE}/progress`);
await settle(p);
await p.getByRole("button", { name: "Edit habit" }).click();
await p.getByRole("button", { name: "Save habit" }).waitFor();
await p.screenshot({ path: artifact("habit-edit-390.png") });
await phone.close();
await browser.close();
console.log(`habit-edit: ${failed ? `${failed} failing` : "0 failing"}`);
process.exit(failed ? 1 : 0);

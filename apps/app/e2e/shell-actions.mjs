// Drives design v5's shell the way a person does and checks the result through the API:
// a Settings switch and segment save to the profile, a goal's quick log moves it, an agent's
// change is undone from Agents, and the menu opens a space. Run after seed.mjs.

import { op } from "./api.mjs";
import { BASE, launch, settle, signedInContext } from "./lib.mjs";

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const browser = await launch();
const ctx = await signedInContext(browser, { width: 390, height: 844 });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

await page.goto(`${BASE}/settings`);
await settle(page);
await page.getByRole("switch", { name: "Hide finished items" }).click();
await page.getByRole("radio", { name: "List" }).click();
await page.getByRole("button", { name: "Wake up later" }).click();
await page.waitForTimeout(1500);
const s = await op("get_settings");
check(
  s.hideDone === true && s.todayLayout === "list",
  `settings saved (hideDone ${s.hideDone}, todayLayout ${s.todayLayout})`,
);

await page.goto(`${BASE}/goals`);
await settle(page);
const before = (await op("get_progress")).goals.find((g) => g.title === "Save $2,000");
await page.getByRole("button", { name: "Log +$20 on Save $2,000" }).click();
await page.getByText(`$${(before.current + 20).toLocaleString("en-US")} of $2,000`).waitFor();
const after = (await op("get_progress")).goals.find((g) => g.title === "Save $2,000");
check(after.current === before.current + 20, `+$20 logged (${before.current} to ${after.current})`);

await page.goto(`${BASE}/agents`);
await settle(page);
const undo = page.getByRole("button", { name: /^Undo: Added / }).first();
await undo.click();
await page.getByText("Undone", { exact: true }).first().waitFor();
const inbox = await op("get_inbox");
check(
  !inbox.tasks.some((t) => t.title === "Look into standing desks"),
  "Undo on Agents took the added tasks back",
);

await page.goto(`${BASE}/menu`);
await settle(page);
await page
  .getByRole("link", { name: /^Calculus/ })
  .last()
  .click();
await page.waitForURL(/\/space\//);
await page.getByRole("heading", { name: "Calculus", exact: true }).waitFor();
await page.getByRole("button", { name: "Back" }).click();
await page.waitForURL(/\/menu$/);
check(true, "menu opens a space and Back returns to the menu");

// Put the settings back for the next scripts.
await op("update_settings", { hideDone: false, todayLayout: "blocks", dayStart: s.dayStart - 15 });
await browser.close();
console.log(`shell-actions: ${failed} failing`);
process.exit(failed ? 1 : 0);

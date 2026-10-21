// Phone add sheet: a long sentence wraps in the field, Enter adds it, and the task lands on its day.
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";
import { op } from "./api.mjs";

const browser = await launch();
const ctx = await signedInContext(browser, { width: 390, height: 844 });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await page.goto(`${BASE}/today`);
await settle(page);
await page.getByRole("button", { name: "Add task" }).click();
const title = `Essay draft ${Date.now() % 10000}`;
const field = page.getByRole("textbox", { name: "Add a task" });
await field.pressSequentially(`${title} fri 5pm #school every week remind 1h before`, { delay: 5 });
await page.waitForTimeout(400);
await page.screenshot({ path: artifact("add-sheet-long-390.png") });
const box = await field.boundingBox();
console.log(`field height ${Math.round(box.height)}px, value "${await field.inputValue()}"`);
await field.press("Enter");
await page.getByRole("status").filter({ hasText: title }).waitFor();
console.log(`toast: ${await page.getByRole("status").filter({ hasText: title }).innerText()}`);
const week = await op("get_week", {});
const found = JSON.stringify(week).includes(title);
console.log(found ? `ok   ${title} is in the week` : `FAIL ${title} not in the week`);
await browser.close();

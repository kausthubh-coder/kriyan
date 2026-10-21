// A row you click stays selected (after `seed.mjs`): open it, close the panel, and X ticks it
// off; the command menu offers the selected task's commands with their keys.

import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

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

const browser = await launch();
const ctx = await signedInContext(browser, { width: 1440, height: 900 });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
await page.goto(`${BASE}/today`);
await settle(page);
const status = page.getByRole("status");

await step("click a row, close its panel, X ticks it off", async () => {
  await page.getByRole("button", { name: "Open Book the dentist" }).click();
  await page.waitForURL(/\/task\//);
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/today/);
  await page.keyboard.press("x");
  const toast = status.filter({ hasText: "Done: Book the dentist" });
  await toast.waitFor();
  await toast.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("checkbox", { name: "Complete: Book the dentist" }).waitFor();
});

await step("the command menu lists the selected task's commands with their keys", async () => {
  await page.getByRole("button", { name: "Open Run" }).click();
  await page.waitForURL(/\/task\//);
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/today/);
  await page.keyboard.press("Control+k");
  const menu = page.getByRole("dialog", { name: "Command menu" });
  await menu.getByText("Selected task").waitFor();
  await page.screenshot({ path: artifact("select-command-1440.png") });
  await menu.getByText("Move to tomorrow").click();
  const toast = status.filter({ hasText: "Moved to Tomorrow: Run" });
  await toast.waitFor();
  await toast.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Open Run" }).waitFor();
});

await step("going to another screen clears the selection", async () => {
  await page.keyboard.press("u");
  await page.waitForURL(/\/upcoming/);
  await page.keyboard.press("t");
  await page.waitForURL(/\/today/);
  await page.keyboard.press("Control+k");
  const menu = page.getByRole("dialog", { name: "Command menu" });
  await menu.getByText("Go to").waitFor();
  if (await menu.getByText("Selected task").count()) throw new Error("still shows a selected task");
  await page.keyboard.press("Escape");
});

await browser.close();
console.log(`select-row: ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);

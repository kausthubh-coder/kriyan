// A row you click stays selected (after `seed.mjs`): on desktop Today it opens in the right
// panel, X ticks it off, and the command menu offers the selected task's commands with their
// keys; closing the panel or going to another screen clears the selection.

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
const panel = page.getByRole("complementary", { name: "Details" });
const block = (title) =>
  page.getByRole("button", { name: new RegExp(`^Open ${title}.*, \\d\\d:\\d\\d`) }).first();

await step("click a row: it opens in the panel, X ticks it off, Undo", async () => {
  await block("Write MCP tools").click();
  await panel.getByText("Write MCP tools", { exact: true }).waitFor();
  await page.screenshot({ path: artifact("select-panel-1440.png") });
  await page.keyboard.press("x");
  const toast = status.filter({ hasText: "Done: Write MCP tools" });
  await toast.waitFor();
  await toast.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("checkbox", { name: "Complete: Write MCP tools" }).waitFor();
});

await step("the command menu lists the selected task's commands with their keys", async () => {
  await block("Study for").click();
  await panel.waitFor();
  await page.keyboard.press("Control+k");
  const menu = page.getByRole("dialog", { name: "Command menu" });
  await menu.getByText("Selected task").waitFor();
  await page.screenshot({ path: artifact("select-command-1440.png") });
  await menu.getByText("Move to tomorrow").click();
  const toast = status.filter({ hasText: /^Moved to tomorrow: Study for/ });
  await toast.waitFor();
  await toast.getByRole("button", { name: "Undo" }).click();
  await block("Study for").waitFor();
});

await step("closing the panel, then going to another screen, clears the selection", async () => {
  await block("Write MCP tools").click();
  await panel.getByRole("button", { name: "Close details" }).click();
  await panel.waitFor({ state: "detached" });
  await block("Write MCP tools").click();
  await page.keyboard.press("i");
  await page.waitForURL(/\/inbox/);
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

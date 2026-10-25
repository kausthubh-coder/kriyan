// Undo and Recently deleted: a toast holds while the pointer rests on it, Ctrl+Z takes back the
// newest change from anywhere, and a task deleted elsewhere (an agent, the CLI, a toast that's
// gone) comes back from Recently deleted, at 1440 and 390.
// Run after seed.mjs. Prints ok or FAIL per step; screenshots go to .artifacts/app/.
//   node apps/app/e2e/undo-and-trash.mjs

import { op } from "./api.mjs";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const taskOnToday = async (title) => {
  const day = await op("get_today");
  return [...day.scheduled, ...day.anytime, ...day.done].find((t) => t.title === title);
};

const browser = await launch();
{
  const ctx = await signedInContext(browser, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}/today`);
  await settle(page);

  // A toast's 5 seconds stop while the pointer is on it.
  await page.getByRole("checkbox", { name: "Complete: Book the dentist" }).click();
  const ticked = page.getByRole("status").filter({ hasText: "Done: Book the dentist" });
  await ticked.waitFor();
  await ticked.hover();
  await page.waitForTimeout(6500);
  check(await ticked.isVisible(), "1440: the toast is still there after 6.5 s with the pointer on it");
  await page.screenshot({ path: artifact("undo-toast-held-1440.png") });
  await page.mouse.move(700, 120);
  await page.waitForTimeout(6000);
  check(!(await ticked.isVisible()), "1440: it goes within 6 s of the pointer leaving");

  // Ctrl+Z runs the newest Undo, with focus nowhere near the toast.
  await page.getByRole("checkbox", { name: "Complete: Write MCP tools" }).click();
  await page.getByRole("status").filter({ hasText: "Done: Write MCP tools" }).waitFor();
  await page.waitForTimeout(1500); // past the 900 ms before the tick is sent
  // Focus is on the checkbox just ticked, not in a text field, where Ctrl+Z stays the browser's.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1500);
  const mcp = await taskOnToday("Write MCP tools");
  check(mcp && !mcp.done, "1440: Ctrl+Z took the tick on Write MCP tools back (get_today shows it open)");

  // A delete with no toast to undo (an agent's) comes back from Recently deleted.
  const reading = await taskOnToday("Read chapter 7.4");
  await op("delete_task", { taskId: reading._id });
  await page.goto(`${BASE}/settings`);
  await settle(page);
  await page.getByRole("button", { name: "Open recently deleted" }).click();
  await page.waitForURL(/\/trash$/);
  await settle(page);
  const row = page.getByTestId(`deleted-${reading._id}`);
  await row.waitFor();
  check(
    (await page.getByRole("heading", { name: "Deleted today" }).count()) > 0,
    '1440: Recently deleted groups it under "Deleted today"',
  );
  const meta = await row.innerText();
  check(
    /Today, 22:00/.test(meta) && /School \/ Physics/.test(meta),
    `1440: its row says where it was: ${JSON.stringify(meta)}`,
  );
  await page.screenshot({ path: artifact("recently-deleted-1440.png") });
  await page.getByRole("button", { name: "Restore Read chapter 7.4" }).click();
  await page.getByRole("status").filter({ hasText: "Restored: Read chapter 7.4" }).waitFor();
  await row.waitFor({ state: "detached" });
  check(
    Boolean(await taskOnToday("Read chapter 7.4")),
    "1440: after Restore, get_today has it at 22:00 again",
  );
  await ctx.close();
}
{
  const ctx = await signedInContext(browser, { width: 390, height: 844 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const inbox = (await op("get_inbox")).tasks;
  const desks = inbox.find((t) => t.title === "Look into standing desks");
  await op("delete_task", { taskId: desks._id });
  // On a phone, Settings is in the menu.
  await page.goto(`${BASE}/menu`);
  await settle(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await settle(page);
  await page.getByRole("button", { name: "Open recently deleted" }).click();
  await page.waitForURL(/\/trash$/);
  await settle(page);
  await page.getByTestId(`deleted-${desks._id}`).waitFor();
  await page.screenshot({ path: artifact("recently-deleted-390.png") });
  await page.getByRole("button", { name: "Restore Look into standing desks" }).click();
  await page.getByRole("status").filter({ hasText: "Restored: Look into standing desks" }).waitFor();
  check(
    (await op("get_inbox")).tasks.some((t) => t.title === "Look into standing desks"),
    "390: Restore puts it back in the Inbox",
  );
  await page.screenshot({ path: artifact("recently-deleted-390-empty.png") });
  check(
    await page.getByText("Nothing deleted").isVisible(),
    '390: with nothing left it says "Nothing deleted"',
  );
  await ctx.close();
}
await browser.close();
console.log(`undo-and-trash: ${failed ? `${failed} failing` : "0 failing"}`);
process.exit(failed ? 1 : 0);

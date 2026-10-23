// Adding a task from a space's own page puts it in that space, not the Inbox, at 1440 and 390.
// Run after seed.mjs. Prints ok or FAIL per step; screenshots go to .artifacts/app/.
//   node apps/app/e2e/space-add.mjs

import { op } from "./api.mjs";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const kriyan = (await op("list_spaces")).find((s) => s.name === "Kriyan");
if (!kriyan) throw new Error("No Kriyan space: run seed.mjs first.");

const browser = await launch();
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const title = `Draft the launch post ${w}`;
  const ctx = await signedInContext(browser, { width: w, height: h });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}/space/${kriyan._id}`);
  await settle(page);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByPlaceholder(/^Add to Kriyan/).fill(title);
  await page.keyboard.press("Enter");
  const toast = await page
    .getByRole("status")
    .filter({ hasText: `Added to Kriyan: ${title}` })
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check(toast, `${w}: the toast says "Added to Kriyan: ${title}"`);
  await page.screenshot({ path: artifact(`space-add-${w}.png`) });

  await page.reload();
  await settle(page);
  const listed = await page
    .getByRole("button", { name: `Open ${title}` })
    .first()
    .isVisible()
    .catch(() => false);
  check(listed, `${w}: after a reload the Kriyan page lists it`);
  await page.screenshot({ path: artifact(`space-add-${w}-reloaded.png`) });

  const space = await op("get_space", { spaceId: kriyan._id });
  const task = space.later.find((t) => t.title === title);
  check(Boolean(task), `${w}: get_space shows it in Kriyan`);
  const inbox = await op("get_inbox");
  check(!inbox.some((t) => t.title === title), `${w}: get_inbox doesn't have it`);
  if (task) await op("delete_task", { taskId: task._id });
  await ctx.close();
}
await browser.close();
console.log(`space-add: ${failed ? `${failed} failing` : "0 failing"}`);
process.exit(failed ? 1 : 0);

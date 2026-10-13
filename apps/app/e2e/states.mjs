// Screenshots of the states, not just the resting screens: the task panel, the repeat
// editor, the command menu, quick add, the slash menu, an error, the offline notice and a
// loading skeleton. At 390 and 1440.

import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

const browser = await launch();
for (const [w, h] of [
  [390, 844],
  [1440, 900],
]) {
  const ctx = await signedInContext(browser, { width: w, height: h });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const shot = (name) => page.screenshot({ path: artifact(`state-${name}-${w}.png`) });

  await page.goto(`${BASE}/today`);
  await settle(page);
  await page.getByRole("button", { name: /^Open Write MCP tools/ }).first().click();
  await page.waitForTimeout(800);
  await shot("panel");
  await page.getByRole("button", { name: /^When:/ }).click();
  await page.waitForTimeout(500);
  await shot("when-editor");
  if (w === 390) await page.getByRole("button", { name: "Back to the task" }).click();
  else await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Reminders|^Add reminder|^Reminder:/ }).first().click();
  await page.waitForTimeout(500);
  await shot("reminders-editor");

  await page.goto(`${BASE}/today`);
  await settle(page);
  await page.getByRole("button", { name: /^Open Calculus II lecture|^Open Run/ }).first().click().catch(() => undefined);
  await page.goto(`${BASE}/upcoming`);
  await settle(page);
  await page.getByRole("button", { name: /^Open Calculus II lecture/ }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^Repeat:/ }).click();
  await page.waitForTimeout(500);
  await shot("repeat-editor-weekly");

  await page.goto(`${BASE}/today`);
  await settle(page);
  if (w === 1440) {
    await page.keyboard.press("Control+k");
    await page.getByRole("textbox", { name: "Search or type a task" }).fill("call");
    await page.waitForTimeout(400);
    await shot("command-search");
    await page.keyboard.press("Escape");
  } else {
    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByRole("textbox", { name: "Add a task" }).fill("Essay fri 5pm #school every week remind 1h before");
    await page.waitForTimeout(400);
    await shot("add-sheet");
  }

  // An error, as a person would see it: a task link that isn't theirs.
  await page.goto(`${BASE}/task/k57000000000000000000000000000000`);
  await settle(page);
  await shot("error");

  // Offline: the connection drops; a quiet banner says edits will save later.
  await page.goto(`${BASE}/today`);
  await settle(page);
  await ctx.setOffline(true);
  await page.waitForTimeout(6000);
  await shot("offline");
  await ctx.setOffline(false);

  // Loading: the skeleton in the final layout, while the data is on its way.
  const slow = await ctx.newPage();
  await slow.route(/convex\.cloud/, (route) => setTimeout(() => route.continue(), 4000));
  await slow.goto(`${BASE}/progress`);
  await slow.waitForSelector('[data-testid="skeleton"]', { timeout: 60000 }).catch(() => undefined);
  await slow.screenshot({ path: artifact(`state-loading-${w}.png`) });
  await ctx.close();
}
await browser.close();
console.log("states shot");

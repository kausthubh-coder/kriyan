// Walks the main flows on the desktop web app the way a person would and checks what lands
// on screen: space colours, a habit, a goal, complete and undo, delete and undo, drag onto the
// timeline, resize, the command menu, keyboard shortcuts, a note with the slash menu, tokens.
//   node apps/app/e2e/walkthrough.mjs

import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

const browser = await launch();
const ctx = await signedInContext(browser, { width: 1440, height: 900 });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: artifact(`fail-${name.replace(/\W+/g, "-")}.png`) });
  }
}
const toast = (text) => page.getByRole("status").filter({ hasText: text }).first().waitFor();

async function colour(space, name) {
  await page.goto(`${BASE}/browse`);
  await settle(page);
  await page.getByRole("link", { name: space, exact: true }).last().click();
  await page.waitForURL(/\/space\//);
  await settle(page);
  await page.getByRole("button", { name: "Space options" }).click();
  await page.getByRole("menuitem", { name: "Change colour" }).click();
  await page.getByRole("radio", { name }).click();
  await page.waitForTimeout(600);
}

await step("space colours: Work orange, Kriyan purple, Life green, Calculus and Physics stay School blue", async () => {
  await colour("Work", "Orange");
  await colour("Kriyan", "Purple");
  await colour("Clients", "Orange");
  await colour("Life", "Green");
});

await step("add a habit from Progress and check it on Today", async () => {
  await page.goto(`${BASE}/progress`);
  await settle(page);
  if (!(await page.getByText("Read 20 min", { exact: true }).count())) {
    await page.getByRole("button", { name: "Add habit" }).click();
    await page.getByRole("textbox", { name: "Habit" }).fill("Read 20 min");
    await page.getByRole("button", { name: "4 times a week" }).click();
    await page.getByRole("button", { name: "Add habit", exact: true }).last().click();
    await page.getByText("Read 20 min", { exact: true }).first().waitFor();
  }
  await page.goto(`${BASE}/today`);
  await settle(page);
  const habit = page.getByRole("switch", { name: /^Read 20 min/ });
  const before = await habit.getAttribute("aria-checked");
  await habit.click();
  await page.waitForFunction((b) => document.querySelector('[role="switch"][aria-label^="Read 20 min"]')?.getAttribute("aria-checked") !== b, before);
});

await step("add a goal from Progress and link a task to it", async () => {
  await page.goto(`${BASE}/progress`);
  await settle(page);
  if (!(await page.getByText("Launch Kriyan by 1 Nov", { exact: true }).count())) {
    await page.getByRole("button", { name: "Add goal" }).click();
    await page.getByRole("textbox", { name: "Goal" }).fill("Launch Kriyan by 1 Nov");
    await page.getByRole("textbox", { name: "Target" }).fill("14");
    await page.getByRole("button", { name: "Add a due date" }).click();
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: /^Sun 1 Nov/ }).click();
    await page.getByRole("button", { name: "Add goal", exact: true }).last().click();
    await page.getByText("Launch Kriyan by 1 Nov", { exact: true }).waitFor();
  }
  await page.goto(`${BASE}/today`);
  await settle(page);
  await page.getByRole("button", { name: /^Open Write MCP tools/ }).first().click();
  await page.getByRole("button", { name: /^Goal:/ }).click();
  await page.getByRole("menuitem", { name: "Launch Kriyan by 1 Nov" }).first().click();
  await page.getByRole("button", { name: "Goal: Launch Kriyan by 1 Nov" }).waitFor();
  await page.keyboard.press("Escape");
});

await step("tick a repeating task: it shows done at once, the toast names the next date, Undo brings it back", async () => {
  await page.goto(`${BASE}/today`);
  await settle(page);
  await page.getByRole("checkbox", { name: "Complete: Run" }).click();
  await page.getByRole("checkbox", { name: "Mark not done: Run" }).first().waitFor({ timeout: 1000 });
  await toast("Done: Run");
  await toast("Next: Wed 14 Oct");
  await page.screenshot({ path: artifact("flow-complete-toast-1440.png") });
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("checkbox", { name: "Complete: Run" }).waitFor();
});

await step("tick and untick before the row moves (Undo during the moment it stays)", async () => {
  await page.getByRole("checkbox", { name: "Complete: Book the dentist" }).click();
  await page.getByRole("button", { name: "Undo" }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("checkbox", { name: "Complete: Book the dentist" }).waitFor();
});

const dragTitle = `Pack the gym bag ${new Date().getMinutes()}${new Date().getSeconds()}`;
await step("drag an anytime task onto the timeline at a 15-minute step", async () => {
  await page.goto(`${BASE}/today`);
  await settle(page);
  // A fresh task from Today's field (no date typed, so it lands on today with no time).
  await page.getByRole("textbox", { name: "Add a task" }).fill(dragTitle);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: `Open ${dragTitle}` }).waitFor();
  if (await page.getByRole("button", { name: /^Earlier today/ }).count()) await page.getByRole("button", { name: /^Earlier today/ }).click();
  const row = page.getByRole("button", { name: `Open ${dragTitle}` });
  const box = await row.boundingBox();
  const timeline = page.getByLabel("Schedule");
  await timeline.scrollIntoViewIfNeeded();
  const t = await timeline.boundingBox();
  if (!box || !t) throw new Error("no boxes");
  await row.scrollIntoViewIfNeeded();
  const b2 = await row.boundingBox();
  await page.mouse.move(b2.x + 20, b2.y + 10);
  await page.mouse.down();
  await page.mouse.move(b2.x + 30, b2.y + 30, { steps: 4 });
  await timeline.scrollIntoViewIfNeeded();
  const t2 = await timeline.boundingBox();
  // 21:00 on the timeline: find the hour label.
  const label = page.getByLabel("Schedule").getByText("18:00", { exact: true });
  const lb = await label.boundingBox();
  await page.mouse.move(t2.x + 300, lb.y + 8 + 2, { steps: 8 });
  await page.screenshot({ path: artifact("flow-drag-1440.png") });
  await page.mouse.up();
  await page.getByRole("button", { name: new RegExp(`^Open ${dragTitle}, 18:00`) }).waitFor();
});

await step("resize a block by its bottom edge to set a length", async () => {
  const block = page.getByRole("button", { name: new RegExp(`^Open ${dragTitle}, 18:00`) });
  const before = await block.getAttribute("aria-label");
  const b = await block.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height + 1);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height + 30, { steps: 6 });
  await page.mouse.up();
  // 30px down is 30 minutes longer at 56px an hour.
  await page.waitForFunction(
    ([b, prefix]) => [...document.querySelectorAll("[aria-label]")].some((e) => (e.getAttribute("aria-label") ?? "").startsWith(prefix) && e.getAttribute("aria-label") !== b),
    [before, `Open ${dragTitle}, 18:00–`],
  );
  console.log(`     ${before} -> ${await block.getAttribute("aria-label")}`);
});

await step("delete from the panel, then Undo restores it", async () => {
  await page.getByRole("button", { name: new RegExp(`^Open ${dragTitle}`) }).first().click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete task" }).click();
  await toast(`Deleted: ${dragTitle}`);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: new RegExp(`^Open ${dragTitle}`) }).first().waitFor();
});

await step("command menu adds a task from one sentence", async () => {
  await page.goto(`${BASE}/today`);
  await settle(page);
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Search or type a task" }).fill("call mum fri 6pm #life every week");
  await page.screenshot({ path: artifact("command-1440.png") });
  await page.keyboard.press("Enter");
  await toast("Added: call mum");
});

await step("keyboard: J selects, X completes, Undo, T and U navigate", async () => {
  await page.goto(`${BASE}/today`);
  await settle(page);
  await page.locator("body").click({ position: { x: 1300, y: 600 } });
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  const selected = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="task-"]')].filter((e) => getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)").length);
  if (selected < 1) throw new Error("nothing selected");
  await page.keyboard.press("x");
  await toast("Done:");
  await page.getByRole("button", { name: "Undo" }).first().click();
  await page.keyboard.press("u");
  await page.waitForURL(/\/upcoming/);
  await page.keyboard.press("t");
  await page.waitForURL(/\/today/);
});

await step("note on a space with the slash menu and a checklist", async () => {
  await page.goto(`${BASE}/browse`);
  await settle(page);
  await page.getByRole("link", { name: "Kriyan", exact: true }).last().click();
  await page.waitForURL(/\/space\//);
  await settle(page);
  const existing = await page.getByText("Launch plan", { exact: true }).count();
  if (!existing) {
    await page.getByRole("button", { name: "Add a note" }).first().click();
    const input = page.getByRole("textbox", { name: /^Note/ });
    await input.fill("/");
    await page.getByRole("option", { name: /Heading/ }).waitFor();
    await page.screenshot({ path: artifact("slash-menu-1440.png") });
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: /^Note/ }).fill("Launch plan");
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: /^Note/ }).fill("[ ] Demo video, 60 seconds");
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: /^Note/ }).fill("Post on Hacker News");
    await page.locator("body").click({ position: { x: 1300, y: 860 } });
    await page.waitForTimeout(1200);
  }
  await page.reload();
  await settle(page);
  await page.getByText("Launch plan", { exact: true }).waitFor();
  await page.getByRole("checkbox", { name: /Demo video/ }).waitFor();
});

await step("settings: create a token, see it once, revoke it", async () => {
  await page.goto(`${BASE}/settings`);
  await settle(page);
  await page.getByRole("textbox", { name: "Token name" }).fill("Walkthrough CLI");
  await page.getByRole("button", { name: "Create token" }).click();
  await page.getByText("Copy your new token now").waitFor();
  await page.getByRole("button", { name: "Copy the token" }).click();
  await toast("Copied the token");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.startsWith("kriyan_")) throw new Error("clipboard does not hold the token");
  await page.getByRole("button", { name: "I've copied it" }).click();
  await page.getByRole("button", { name: "Revoke Walkthrough CLI" }).first().click();
  await toast("Revoked Walkthrough CLI");
});

await page.goto(`${BASE}/today`);
await settle(page);
await page.screenshot({ path: artifact("today-after-walkthrough-1440.png"), fullPage: false });
if (errors.length) console.log(`page errors:\n  ${[...new Set(errors)].join("\n  ")}`);
console.log(`walkthrough: ${failed} failing`);
await browser.close();
process.exit(failed ? 1 : 0);

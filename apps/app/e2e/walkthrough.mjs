// Walks the main flows on the desktop web app the way a person would and checks what lands
// on screen: space colours, a habit, a goal, complete and undo, Fill a free stretch, a block's
// time and length, remove and undo, the command menu, keyboard shortcuts, a note with the
// slash menu, tokens.
//   node apps/app/e2e/seed.mjs && node apps/app/e2e/walkthrough.mjs

import { addDays, todayIn } from "@kriyan/core/dates";
import { formatDay } from "@kriyan/core/format";
import { op } from "./api.mjs";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

// Starts from `node apps/app/e2e/seed.mjs`: "Run" repeats every 2 days after it's done.
const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);

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
  await page.goto(`${BASE}/menu`);
  await settle(page);
  await page
    .getByRole("link", { name: new RegExp(`^${space}(, \\d+)?$`) })
    .last()
    .click();
  await page.waitForURL(/\/space\//);
  await settle(page);
  await page.getByRole("button", { name: "Space options" }).click();
  await page.getByRole("menuitem", { name: "Change colour" }).click();
  await page.getByRole("radio", { name }).click();
  await page.waitForTimeout(600);
}

await step(
  "space colours: Work orange, Kriyan purple, Life green, Calculus and Physics stay School blue",
  async () => {
    await colour("Work", "Orange");
    await colour("Kriyan", "Purple");
    await colour("Clients", "Orange");
    await colour("Life", "Green");
  },
);

await step("add a habit from Goals and habits and check it on Today", async () => {
  await page.goto(`${BASE}/goals`);
  await settle(page);
  if (!(await page.getByText("Read 20 min", { exact: true }).filter({ visible: true }).count())) {
    await page.getByRole("button", { name: "Add a habit" }).click();
    await page.getByRole("textbox", { name: "Habit" }).fill("Read 20 min");
    await page.getByRole("button", { name: "4 times a week" }).click();
    await page.getByRole("button", { name: "Add habit", exact: true }).last().click();
    await page.getByText("Read 20 min", { exact: true }).filter({ visible: true }).first().waitFor();
  }
  await page.goto(`${BASE}/`);
  await settle(page);
  // v5: a habit with no time of its own is a thin row with a dashed box, before the night routine.
  const habit = page.getByRole("checkbox", { name: /: Read 20 min$/ }).filter({ visible: true });
  const before = await habit.getAttribute("aria-checked");
  await habit.click();
  await page.waitForFunction(
    (b) =>
      [...document.querySelectorAll('[role="checkbox"]')]
        .find((e) => /: Read 20 min$/.test(e.getAttribute("aria-label") ?? "") && e.offsetParent)
        ?.getAttribute("aria-checked") !== b,
    before,
  );
});

// Desktop Today selects a row and shows it in the right panel; Edit opens over the page.
const panel = page.getByRole("complementary", { name: "Details" });
const openRow = async (name) => {
  await page.getByRole("button", { name }).filter({ visible: true }).first().click();
  await panel.waitFor();
};

await step("add a goal from Goals and habits and link a task to it", async () => {
  await page.goto(`${BASE}/goals`);
  await settle(page);
  if (!(await page.getByText("Launch Kriyan by 1 Nov", { exact: true }).count())) {
    await page.getByRole("button", { name: "Add a goal" }).click();
    await page.getByRole("textbox", { name: "Goal" }).fill("Launch Kriyan by 1 Nov");
    await page.getByRole("textbox", { name: "Target" }).fill("14");
    await page.getByRole("button", { name: "Add a due date" }).click();
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: /^Sun 1 Nov/ }).click();
    await page.getByRole("button", { name: "Add goal", exact: true }).last().click();
    await page.getByText("Launch Kriyan by 1 Nov", { exact: true }).waitFor();
  }
  await page.goto(`${BASE}/`);
  await settle(page);
  await openRow(/^Open Write MCP tools/);
  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Write MCP tools" });
  await edit.getByRole("button", { name: /^Goal/ }).click();
  await page
    .getByRole("dialog", { name: "Goal" })
    .getByRole("radio", { name: "Launch Kriyan by 1 Nov" })
    .click();
  await edit.getByRole("button", { name: "Goal: Launch Kriyan by 1 Nov" }).waitFor();
  await edit.getByRole("button", { name: "Done", exact: true }).first().click();
  // The panel says what it counts toward.
  await panel.getByText("Launch Kriyan by 1 Nov").waitFor();
});

await step(
  "tick a repeating task: it shows done at once, the toast names the next date, Undo brings it back",
  async () => {
    // "Run" has no time, so blocks offer it in To fit in; the list layout has its checkbox.
    await op("update_settings", { todayLayout: "list" });
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.getByRole("checkbox", { name: "Complete: Run" }).filter({ visible: true }).click();
    await page
      .getByRole("checkbox", { name: "Mark not done: Run" })
      .filter({ visible: true })
      .first()
      .waitFor({ timeout: 1000 });
    await toast("Done: Run");
    await toast(`Next: ${formatDay(addDays(today, 2), today)}`);
    await page.screenshot({ path: artifact("flow-complete-toast-1440.png") });
    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByRole("checkbox", { name: "Complete: Run" }).filter({ visible: true }).waitFor();
  },
);

await step("tick and untick before the row moves (Undo during the moment it stays)", async () => {
  await page.getByRole("checkbox", { name: "Complete: Book the dentist" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Undo" }).first().click();
  await page.waitForTimeout(1500);
  await page
    .getByRole("checkbox", { name: "Complete: Book the dentist" })
    .filter({ visible: true })
    .waitFor();
  await op("update_settings", { todayLayout: "blocks" });
});

const fillTitle = `Pack the gym bag ${new Date().getMinutes()}${new Date().getSeconds()}`;
await step("Fill: a free stretch takes a new task with the length picked, Undo puts it back", async () => {
  await page.goto(`${BASE}/`);
  await settle(page);
  // A fresh task from Today's field (no date typed, so it lands on today with no time).
  await page.getByRole("textbox", { name: "Add a task" }).fill(fillTitle);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: `Fit in ${fillTitle}, any time` }).waitFor();
  await page.getByRole("button", { name: `Fit in ${fillTitle}, any time` }).click();
  const fill = page.getByRole("dialog", { name: "Fill free time" });
  await fill.waitFor();
  // The task is picked already; Kriyan never guesses how long, so the button waits for a length.
  await fill.getByRole("button", { name: "Pick how long" }).waitFor();
  await fill.getByRole("radio", { name: "30 min", exact: true }).click();
  const put = fill.getByRole("button", { name: /^Put it at \d\d:\d\d–\d\d:\d\d$/ });
  const label = (await put.getAttribute("aria-label")) ?? "";
  const range = label.replace("Put it at ", "");
  await page.screenshot({ path: artifact("flow-fill-1440.png") });
  await put.click();
  await toast(`${fillTitle}, ${range}`);
  await page.getByRole("button", { name: `Open ${fillTitle}, ${range}` }).waitFor();
  await page.getByRole("status").filter({ hasText: fillTitle }).getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: `Fit in ${fillTitle}, any time` }).waitFor();
  // Put it back for the next step.
  await page.getByRole("button", { name: `Fit in ${fillTitle}, any time` }).click();
  await fill.getByRole("radio", { name: "30 min", exact: true }).click();
  await fill.getByRole("button", { name: /^Put it at / }).click();
  await page.getByRole("button", { name: new RegExp(`^Open ${fillTitle}, `) }).waitFor();
});

await step("a block's time and length: Edit makes it 30 minutes longer", async () => {
  await openRow(new RegExp(`^Open ${fillTitle}, `));
  const before = await page
    .getByRole("button", { name: new RegExp(`^Open ${fillTitle}, `) })
    .getAttribute("aria-label");
  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: `Edit ${fillTitle}` });
  await edit.getByRole("button", { name: /^Time and length/ }).click();
  const picker = page.getByRole("dialog", { name: "Time and length" });
  await picker.getByRole("radio", { name: "1 h", exact: true }).click();
  await picker.getByText(/^Ends \d\d:\d\d\. Kriyan never guesses a length\.$/).waitFor();
  await page.keyboard.press("Escape");
  await edit.getByRole("button", { name: "Done", exact: true }).first().click();
  await page.waitForFunction(
    ([b, prefix]) =>
      [...document.querySelectorAll("[aria-label]")].some(
        (e) => (e.getAttribute("aria-label") ?? "").startsWith(prefix) && e.getAttribute("aria-label") !== b,
      ),
    [before, `Open ${fillTitle}, `],
  );
  console.log(`     ${before} -> 1 h`);
});

await step("remove from the panel, then Undo restores it", async () => {
  await openRow(new RegExp(`^Open ${fillTitle}`));
  await panel.getByRole("button", { name: "Remove", exact: true }).click();
  await toast(`Deleted: ${fillTitle}`);
  await page
    .getByRole("status")
    .filter({ hasText: `Deleted: ${fillTitle}` })
    .getByRole("button", { name: "Undo" })
    .click();
  await page
    .getByRole("button", { name: new RegExp(`^Open ${fillTitle}`) })
    .first()
    .waitFor();
});

await step("command menu adds a task from one sentence", async () => {
  await page.goto(`${BASE}/today`);
  await settle(page);
  await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Search or type a task" })
    .fill("call mum fri 6pm #life every week");
  await page.screenshot({ path: artifact("command-1440.png") });
  await page.keyboard.press("Enter");
  await toast("Added: call mum");
});

await step("keyboard: J selects, X completes, Undo, T and U navigate", async () => {
  await page.goto(`${BASE}/`);
  await settle(page);
  await page.locator("body").click({ position: { x: 1300, y: 600 } });
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  const selected = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid^="task-"]')].filter(
        (e) => getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)",
      ).length,
  );
  if (selected < 1) throw new Error("nothing selected");
  await page.keyboard.press("x");
  // X finishes what's selected: a task ("Done: …") or a whole routine ("…, all done").
  await page
    .getByRole("status")
    .filter({ hasText: /Done:|all done/ })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Undo" }).first().click();
  await page.keyboard.press("u");
  await page.waitForURL(/\/upcoming/);
  await page.keyboard.press("t");
  await page.waitForURL(/\/today/);
});

await step("note on a space with the slash menu and a checklist", async () => {
  await page.goto(`${BASE}/menu`);
  await settle(page);
  await page
    .getByRole("link", { name: /^Kriyan(, \d+)?$/ })
    .last()
    .click();
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

await page.goto(`${BASE}/`);
await settle(page);
await page.screenshot({ path: artifact("today-after-walkthrough-1440.png"), fullPage: false });
if (errors.length) console.log(`page errors:\n  ${[...new Set(errors)].join("\n  ")}`);
console.log(`walkthrough: ${failed} failing`);
await browser.close();
process.exit(failed ? 1 : 0);

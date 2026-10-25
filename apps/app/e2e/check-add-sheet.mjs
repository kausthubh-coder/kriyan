// Phone add sheet (v5): Today's round Add opens it on Task; a long sentence wraps in the field
// with the understood words in blue, Enter adds it, and the task lands on its day. A space's
// Add (`/add?spaceId=`) puts the task in that space.
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";
import { op } from "./api.mjs";

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const browser = await launch();
const ctx = await signedInContext(browser, { width: 390, height: 844 });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await page.goto(`${BASE}/today`);
await settle(page);
await page.getByRole("button", { name: "Add", exact: true }).click();
const sheet = page.getByRole("dialog", { name: "Add" });
await sheet.waitFor();
check(
  (await sheet.getByRole("tab", { name: "Task" }).getAttribute("aria-selected")) === "true",
  "the sheet opens on Task",
);
const title = `Essay draft ${Date.now() % 10000}`;
const field = sheet.getByRole("textbox", { name: "Task title" });
await field.pressSequentially(`${title} fri 5pm #school every week remind 1h before`, { delay: 5 });
await page.waitForTimeout(400);
await page.screenshot({ path: artifact("add-sheet-long-390.png") });
const box = await field.boundingBox();
console.log(`     field height ${Math.round(box.height)}px, value "${await field.inputValue()}"`);
check(
  await sheet.getByRole("button", { name: /^Remove Every/ }).isVisible(),
  "the repeat shows as a blue chip",
);
await field.press("Enter");
await page.getByRole("status").filter({ hasText: title }).waitFor();
console.log(`     toast: ${await page.getByRole("status").filter({ hasText: title }).innerText()}`);
const planned = await op("search_tasks", { text: title });
check(Boolean(planned.tasks[0]?.date), `${title} is planned (${planned.tasks[0]?.date})`);

// A space's Add.
const spaces = await op("list_spaces", {});
const physics = (spaces.spaces ?? spaces).find((s) => s.name === "Physics");
await page.goto(`${BASE}/add?spaceId=${physics._id}`);
await settle(page);
const inSpace = `Lab notes ${Date.now() % 10000}`;
await page.getByRole("textbox", { name: "Task title" }).fill(inSpace);
await page.keyboard.press("Enter");
await page.getByRole("status").filter({ hasText: inSpace }).waitFor();
const found = await op("search_tasks", { text: inSpace });
check(
  found.tasks[0]?.spacePath?.endsWith("Physics"),
  `?spaceId= puts it in Physics (${found.tasks[0]?.spacePath})`,
);
await browser.close();
console.log(`check-add-sheet: ${failed} failing`);
process.exit(failed ? 1 : 0);

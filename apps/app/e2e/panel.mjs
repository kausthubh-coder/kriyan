// Opens a task from Today, then its repeat editor, at desktop and phone widths.
import { BASE, launch, artifact, signedInContext, settle } from "./lib.mjs";
const name = process.argv[2] ?? "Run";
const browser = await launch();
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const ctx = await signedInContext(browser, { width: w, height: h });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => console.log(`[pageerror] ${e}`));
  page.on("console", (m) => m.type() === "error" && console.log(`[error] ${m.text().slice(0, 300)}`));
  await page.goto(`${BASE}/today`);
  await settle(page);
  await page
    .getByRole("button", { name: `Open ${name}` })
    .first()
    .click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: artifact(`panel-${w}.png`) });
  await page.getByRole("button", { name: /^Repeat:/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: artifact(`repeat-${w}.png`) });
  await ctx.close();
}
await browser.close();

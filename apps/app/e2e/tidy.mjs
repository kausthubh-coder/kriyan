// Archives duplicate goals left by repeated test runs (through the app).
import { BASE, launch, settle, signedInContext } from "./lib.mjs";
const browser = await launch();
const ctx = await signedInContext(browser);
const page = await ctx.newPage();
await page.goto(`${BASE}/progress`);
await settle(page);
while ((await page.getByRole("button", { name: /^Launch Kriyan by 1 Nov,/ }).count()) > 1) {
  await page.getByRole("button", { name: /^Launch Kriyan by 1 Nov,/ }).last().click();
  await page.getByRole("button", { name: "Archive goal" }).click();
  await page.waitForTimeout(800);
}
console.log("goals now:", await page.getByRole("button", { name: /^Launch Kriyan by 1 Nov,/ }).count());
await browser.close();

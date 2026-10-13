// Drops the connection and measures how long until the offline notice shows, and that it
// goes away again when the connection returns.
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";
const browser = await launch();
const ctx = await signedInContext(browser, { width: 390, height: 844 });
const page = await ctx.newPage();
await page.goto(`${BASE}/today`);
await settle(page);
const t0 = Date.now();
await ctx.setOffline(true);
const shown = await page.getByText(/^You’re offline|^You're offline/).waitFor({ timeout: 90000 }).then(() => true).catch(() => false);
console.log(`offline notice: ${shown ? `shown after ${Math.round((Date.now() - t0) / 1000)} s` : "not shown in 90 s"}`);
await page.screenshot({ path: artifact("state-offline-390.png") });
await ctx.setOffline(false);
const gone = await page.getByText(/^You’re offline|^You're offline/).waitFor({ state: "detached", timeout: 90000 }).then(() => true).catch(() => false);
console.log(`back online: notice ${gone ? "gone" : "still there"}`);
await browser.close();

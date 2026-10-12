// Loads a page, waits, and prints console output and visible text. Debugging aid.
import { BASE, launch, artifact } from "./lib.mjs";
const path = process.argv[2] ?? "sign-in";
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => console.log(`[${m.type()}] ${m.text().slice(0, 400)}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${e}`));
page.on("requestfailed", (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(`${BASE}/${path}`, { timeout: 120000 });
await page.waitForTimeout(Number(process.env.WAIT ?? 8000));
console.log("TEXT:", (await page.evaluate(() => document.body.innerText)).slice(0, 800));
await page.screenshot({ path: artifact("debug.png") });
await browser.close();

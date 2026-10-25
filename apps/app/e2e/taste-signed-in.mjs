// The Critly taste pass on the signed-in app: squint, boxes and edges, and what each screen
// leads with, at 390 and 1440. Writes a squint and an overlay image per screen to
// .critly/taste/ and prints the looks. It never fails; open the images.
//   node apps/app/e2e/taste-signed-in.mjs [path ...]   (default: every main route)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { formatTaste, tasteSummaryLine } from "@kausthubh/critly";
import { BASE, launch, settle, signedInContext } from "./lib.mjs";

process.chdir(new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));

const TASTE = readFileSync("node_modules/@kausthubh/critly/src/taste.js", "utf8");
const routes = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => (p.startsWith("/") ? p : `/${p}`))
  : ["/today", "/menu", "/inbox", "/goals", "/agents", "/settings", "/upcoming", "/trash", "/space:Calculus"];
const out = ".critly/taste";
mkdirSync(out, { recursive: true });

const browser = await launch();
const results = [];
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  const ctx = await signedInContext(browser, viewport);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  for (const route of routes) {
    if (route.startsWith("/space:")) {
      // A space by name: open it from the menu, the way a person would.
      await page.goto(`${BASE}/menu`);
      await settle(page);
      await page
        .getByRole("link", { name: new RegExp(`^${route.slice(7)}(, \\d+)?$`) })
        .last()
        .click();
      await page.waitForURL(/\/space\//);
    } else await page.goto(`${BASE}${route}`);
    await settle(page);
    const shot = `data:image/png;base64,${(await page.screenshot({ type: "png" })).toString("base64")}`;
    await page.evaluate(TASTE);
    const r = await page.evaluate((o) => window.__critlyTaste(o), { screenshot: shot, blur: 6 });
    const stem = `${route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-")}-${viewport.width}`;
    const files = { squint: `${out}/${stem}.squint.png`, overlay: `${out}/${stem}.taste.png` };
    writeFileSync(files.squint, Buffer.from(r.squint.image.split(",")[1], "base64"));
    await page.evaluate((report) => window.__critlyTaste.overlay(report), r);
    writeFileSync(files.overlay, await page.screenshot({ type: "png" }));
    const { _draw, ...rest } = r;
    delete rest.squint.image;
    results.push({
      page: `${BASE}${route}`,
      viewport: `${viewport.width}x${viewport.height}`,
      files,
      ...rest,
    });
  }
  await ctx.close();
}
await browser.close();
const report = {
  out,
  exitCode: 0,
  results,
  totals: { looks: results.reduce((n, r) => n + r.looks.length, 0) },
};
console.log(formatTaste(report));

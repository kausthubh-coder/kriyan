// Screenshots of every screen at 390 and 1440 into .artifacts/app/.
//   node apps/app/e2e/shoot.mjs [path ...]   (default: every main route)
//   SIGNED_OUT=1 node apps/app/e2e/shoot.mjs /sign-in

import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

const routes = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => (p.startsWith("/") ? p : `/${p}`))
  : ["/today", "/menu", "/inbox", "/goals", "/agents", "/settings"];
const widths = [
  { name: "390", viewport: { width: 390, height: 844 } },
  { name: "1440", viewport: { width: 1440, height: 900 } },
];

const browser = await launch();
for (const { name, viewport } of widths) {
  const ctx = process.env.SIGNED_OUT
    ? await browser.newContext({ viewport, reducedMotion: "reduce" })
    : await signedInContext(browser, viewport);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
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
    const suffix = process.env.SCHEME ? `-${process.env.SCHEME}` : "";
    const file = `${route.replace(/^\//, "").replace(/[/?=&:]/g, "_") || "root"}-${name}${suffix}.png`;
    await page.screenshot({ path: artifact(file), fullPage: process.env.FULL === "1" });
    console.log(`shot ${file}`);
  }
  if (errors.length)
    console.log(`console errors at ${name}:\n  ${[...new Set(errors)].slice(0, 10).join("\n  ")}`);
  await ctx.close();
}
await browser.close();

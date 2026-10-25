// Screenshots of design v5's shell screens (Menu, Inbox, a space, Goals and habits, Agents,
// Settings) at 390 and 1440, light and dark, for comparing with docs/design/v5/prototype.html.
// Run after seed.mjs. Writes .artifacts/app/joi-shell/<screen>-<width>-<scheme>.png.
//   node apps/app/e2e/shell-screens.mjs [screen ...]

import { mkdirSync } from "node:fs";
import { artifact, BASE, launch, settle, signedInContext } from "./lib.mjs";

const SCREENS = {
  menu: (p) => p.goto(`${BASE}/menu`),
  inbox: (p) => p.goto(`${BASE}/inbox`),
  space: async (p) => {
    await p.goto(`${BASE}/menu`);
    await settle(p);
    await p
      .getByRole("link", { name: /^Calculus/ })
      .last()
      .click();
    await p.waitForURL(/\/space\//);
  },
  goals: (p) => p.goto(`${BASE}/goals`),
  agents: (p) => p.goto(`${BASE}/agents`),
  settings: (p) => p.goto(`${BASE}/settings`),
};
const only = process.argv.slice(2);
mkdirSync(artifact("joi-shell"), { recursive: true });
const browser = await launch();
for (const scheme of ["light", "dark"]) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    const ctx = await signedInContext(browser, viewport, scheme);
    for (const [name, go] of Object.entries(SCREENS)) {
      if (only.length && !only.includes(name)) continue;
      const page = await ctx.newPage();
      page.setDefaultTimeout(60000);
      await go(page);
      await settle(page);
      await page.waitForTimeout(500);
      const file = artifact(`joi-shell/${name}-${viewport.width}-${scheme}.png`);
      await page.screenshot({ path: file });
      console.log(`shot ${file}`);
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();

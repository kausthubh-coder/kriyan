// Renders the product images on the landing page from the B2 prototype
// (.agents/reports/2026-10-22-kriyan-redesign/variant-b2.html). These are prototype renders:
// once the app ships the B2 design, render them from the real app instead.
// Run with Node, not Bun (Playwright hangs under Bun on Windows):
//   node apps/site/scripts/render-product.mjs
// The browser comes from scripts/browser.mjs; set CHROMIUM_PATH to pick another.

import { launchBrowser } from "../../../scripts/browser.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const prototype = join(here, "../../../.agents/reports/2026-10-22-kriyan-redesign/variant-b2.html");
const out = join(here, "../src/assets/product");

const askTimeFor = async (page) => {
  await page.getByRole("button", { name: "What do I have time for?" }).first().click();
};
const screens = [
  { screen: "today" },
  { screen: "assistant", act: askTimeFor },
  { screen: "goals" },
  { screen: "review" },
];
const sizes = [
  { suffix: "desktop", width: 1280, height: 800 },
  { suffix: "phone", width: 390, height: 844 },
];

const schemes = ["light", "dark"];

const browser = await launchBrowser();
for (const { screen, act } of screens) {
  for (const scheme of schemes)
    for (const { suffix, width, height } of sizes) {
      const phone = width < 500;
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        colorScheme: scheme,
        hasTouch: phone,
        isMobile: phone,
      });
      const page = await context.newPage();
      await page.goto(`${pathToFileURL(prototype).href}?screen=${screen}&theme=${scheme}`);
      // The prototype's haptic labels are a design aid, not part of the product.
      await page.addStyleTag({ content: ".hchip{display:none!important}" });
      await page.evaluate(() => document.fonts.ready);
      if (act) await act(page);
      await page.waitForTimeout(700);
      const path = join(out, `b2-${screen}-${scheme === "dark" ? "dark-" : ""}${suffix}.png`);
      await page.screenshot({ path });
      console.log(path);
      await context.close();
    }
}
await browser.close();

// Renders the approved v3 screens (docs/design/v3) to the product images on the landing page.
// Run with Node, not Bun (Playwright hangs under Bun on Windows):
//   node apps/site/scripts/render-product.mjs
// Set CHROMIUM to a Chromium or headless shell binary if Playwright's default isn't installed.

import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const v3 = join(here, "../../../docs/design/v3");
const out = join(here, "../src/assets/product");

const shots = [
  { page: "today", name: "today-desktop", width: 1280, height: 800 },
  { page: "upcoming", name: "upcoming-desktop", width: 1280, height: 800 },
  { page: "progress", name: "progress-desktop", width: 1280, height: 800 },
  { page: "today", name: "today-phone", width: 390, height: 844 },
  { page: "upcoming", name: "upcoming-phone", width: 390, height: 844 },
  { page: "progress", name: "progress-phone", width: 390, height: 844 },
];

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const shot of shots) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
  });
  await page.goto(pathToFileURL(join(v3, `${shot.page}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${shot.name}.png`) });
  await page.close();
  console.log(`wrote ${shot.name}.png (${shot.width * 2}x${shot.height * 2})`);
}
await browser.close();

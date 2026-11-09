// Screenshots every .phone in a round's mockup page into that round's folder.
//   node docs/design/hill-climb/mock/shoot.mjs r4
// Writes r4/NN-<data-name>.png, one per phone, and r4/all.png with every phone side by side.

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const round = process.argv[2];
if (!round) throw new Error("usage: shoot.mjs <round folder, e.g. r4>");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, round);
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(dir, "mockup.html")).href);
await page.evaluate(() => document.fonts.ready);
const phones = await page.locator(".wrap").all();
for (const [i, phone] of phones.entries()) {
  const name = (await phone.getAttribute("data-name")) ?? `screen-${i + 1}`;
  const file = join(dir, `${String(i + 1).padStart(2, "0")}-${name}.png`);
  await phone.screenshot({ path: file });
  console.log(file);
}
await page.screenshot({ path: join(dir, "all.png"), fullPage: true });
await browser.close();

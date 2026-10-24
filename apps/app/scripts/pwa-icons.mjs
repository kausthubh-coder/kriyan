// Renders the web app's Home Screen icons from the K logo (docs/design/brand/k-dot-app-icon.svg):
// apple-touch-icon 180, icons 192 and 512, and a maskable 512 for Android's shapes.
//   node apps/app/scripts/pwa-icons.mjs
import { readFileSync } from "node:fs";
import { launchBrowser } from "../../../scripts/browser.mjs";

const root = new URL("../../../", import.meta.url);
const svg = readFileSync(new URL("docs/design/brand/k-dot-app-icon.svg", root), "utf8");
// Maskable icons keep their mark inside the middle 80%; the app icon's mark sits in the middle
// 56%, so the same drawing works for both.
const out = [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
];
const browser = await launchBrowser();
const page = await browser.newPage();
for (const [name, size] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(`apps/app/public/${name}`, root).pathname, omitBackground: false });
  console.log(`wrote apps/app/public/${name}`);
}
await browser.close();

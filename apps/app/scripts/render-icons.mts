/// <reference types="node" />
// Renders the app icon, Android adaptive icon layers, splash mark and favicon from the
// ensō in docs/design/v3/logo. Run after the mark or the background token changes:
//   node apps/app/scripts/render-icons.mts (Node 24; Playwright hangs under Bun on Windows)
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { color } from "@kriyan/core/tokens";

const root = new URL("../../../", import.meta.url);
const logo = (name: string) => readFileSync(new URL(`docs/design/v3/logo/${name}`, root), "utf8");
const out = new URL("apps/app/assets/icons/", root);
mkdirSync(out, { recursive: true });

// The full icon uses the app's own background token, so it matches the adaptive background.
const fullIcon = logo("app-icon.svg").replace(/<rect([^>]*)fill="#[0-9a-f]{6}"/i, `<rect$1fill="${color.bg}"`);
// The splash mark sits on the splash background colour, so it is only the ink mark.
const splashMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 36 36">${logo("mark-ink.svg")
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>$/, "")
  .replace(/<path/, `<g fill="${color.ink}"><path`)}</g></svg>`;

const jobs: { file: string; svg: string; size: number }[] = [
  { file: "icon.png", svg: fullIcon, size: 1024 },
  { file: "adaptive-foreground.png", svg: logo("app-icon-foreground.svg"), size: 1024 },
  { file: "adaptive-monochrome.png", svg: logo("app-icon-monochrome.svg"), size: 1024 },
  { file: "splash.png", svg: splashMark, size: 1024 },
  { file: "favicon.png", svg: fullIcon, size: 96 },
];

const executablePath =
  process.env.CHROMIUM_PATH ??
  "C:/Users/kaust/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
for (const job of jobs) {
  await page.setViewportSize({ width: job.size, height: job.size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${job.size}px;height:${job.size}px}</style>${job.svg}`,
  );
  await page.screenshot({ path: new URL(job.file, out).pathname.replace(/^\/([A-Z]:)/, "$1"), omitBackground: true });
  console.log(`wrote assets/icons/${job.file}`);
}
await browser.close();

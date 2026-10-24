// Writes every logo file for each direction from one definition each, then the app's icons
// (launcher, adaptive, themed, favicon, splash) as PNGs for the mark in use.
// Keep these paths and colours in step with apps/site/src/lib/brand.tsx.
// Run from the repo root: node docs/design/brand/build.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "../../../scripts/browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const icons = join(here, "..", "..", "..", "apps", "app", "assets", "icons");
// The light and dark `now` tokens, the Today header's black, and the light ink.
const RED = "#c93126",
  RED_ON_DARK = "#f75e54",
  BG = "#070708",
  INK = "#ffffff",
  INK_LIGHT = "#0f0f11";
const CURRENT = "ring";

const marks = {
  ring: (ink, dot) =>
    `<path d="M19.78 11.46A7.8 7.8 0 1 1 12.54 4.22" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17.52" cy="6.48" r="2.6" fill="${dot}"/>`,
  "k-dot": (ink, dot) =>
    `<path fill="${ink}" d="M3.6 3.5h3.9v6.6l6-6.6h4.7l-6.6 7 7 9.9h-4.7l-5-7.2-1.4 1.5v5.7H3.6z"/><circle cx="20.6" cy="5.4" r="2" fill="${dot}"/>`,
  "day-line": (ink, dot) =>
    `<g fill="none" stroke="${ink}" stroke-linecap="round"><path d="M6 3v18" stroke-width="2.2"/><path d="M10 5.5h6.5M10 9.5h9M10 17.5h5" stroke-width="2.6"/><circle cx="6" cy="13.5" r="2.6" fill="${dot}" stroke="none"/></g>`,
  "k-line": (ink, dot) =>
    `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5v17" stroke-width="3"/><path d="M18 3.5 9.6 12 18.5 20.5" stroke-width="3"/><circle cx="9.6" cy="12" r="2.9" fill="${dot}" stroke="none"/></g>`,
};

const svg = (viewBox, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`;
for (const [name, draw] of Object.entries(marks)) {
  // The mark on its own, for the web (currentColor ink, red now-dot).
  writeFileSync(join(here, `${name}.svg`), svg("0 0 24 24", draw("currentColor", RED)));
  // One colour, for Android's themed icon and print.
  writeFileSync(join(here, `${name}-mono.svg`), svg("0 0 24 24", draw("currentColor", "currentColor")));
  // Full-bleed app icon (iOS Home Screen, stores): mark at 56% on the black ground.
  writeFileSync(
    join(here, `${name}-app-icon.svg`),
    svg(
      "0 0 1024 1024",
      `<rect width="1024" height="1024" fill="${BG}"/><g transform="translate(225.3 225.3) scale(23.89)">${draw(INK, RED_ON_DARK)}</g>`,
    ),
  );
  // Android adaptive foreground: 108 units, mark inside the 66-unit safe circle (40 units wide).
  writeFileSync(
    join(here, `${name}-adaptive-foreground.svg`),
    svg("0 0 108 108", `<g transform="translate(34 34) scale(1.6667)">${draw(INK, RED_ON_DARK)}</g>`),
  );
}
console.log("wrote", Object.keys(marks).length * 4, "SVG files");

// The app's PNGs for the mark in use. Android masks the adaptive foreground to a circle or
// squircle and crops to the middle 66%, so the mark stays inside 40 of its 108 units.
const draw = marks[CURRENT];
const png = {
  "icon.png": [
    1024,
    svg(
      "0 0 1024 1024",
      `<rect width="1024" height="1024" fill="${BG}"/><g transform="translate(225.3 225.3) scale(23.89)">${draw(INK, RED_ON_DARK)}</g>`,
    ),
  ],
  "adaptive-foreground.png": [
    1024,
    svg("0 0 108 108", `<g transform="translate(34 34) scale(1.6667)">${draw(INK, RED_ON_DARK)}</g>`),
  ],
  "adaptive-monochrome.png": [
    1024,
    svg("0 0 108 108", `<g transform="translate(34 34) scale(1.6667)">${draw("#ffffff", "#ffffff")}</g>`),
  ],
  "favicon.png": [
    96,
    svg(
      "0 0 96 96",
      `<rect width="96" height="96" rx="21" fill="${BG}"/><g transform="translate(18 18) scale(2.5)">${draw(INK, RED_ON_DARK)}</g>`,
    ),
  ],
  // The splash shows the mark alone on the scheme's own ground, so it needs both inks.
  // A margin around the mark, as the splash always had, so it doesn't fill its 96px box.
  "splash.png": [1024, svg("-6 -6 36 36", draw(INK_LIGHT, RED))],
  "splash-dark.png": [1024, svg("-6 -6 36 36", draw(INK, RED_ON_DARK))],
};
const browser = await launchBrowser();
const page = await browser.newPage();
for (const [file, [size, markup]] of Object.entries(png)) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
  );
  await page.screenshot({ path: join(icons, file), omitBackground: true });
}
await browser.close();
console.log("wrote", Object.keys(png).length, "app icons for", CURRENT);

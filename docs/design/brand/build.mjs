// Writes every logo file for the three directions from one definition each.
// Keep these paths in step with apps/site/src/lib/brand.tsx.  Run: node docs/design/brand/build.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const RED = "#ff3b30",
  BG = "#0b0b0c",
  INK = "#f3f3f5";

const marks = {
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
      `<rect width="1024" height="1024" fill="${BG}"/><g transform="translate(225.3 225.3) scale(23.89)">${draw(INK, RED)}</g>`,
    ),
  );
  // Android adaptive foreground: 108 units, mark inside the 66-unit safe circle (40 units wide).
  writeFileSync(
    join(here, `${name}-adaptive-foreground.svg`),
    svg("0 0 108 108", `<g transform="translate(34 34) scale(1.6667)">${draw(INK, RED)}</g>`),
  );
}
console.log("wrote", Object.keys(marks).length * 4, "files");

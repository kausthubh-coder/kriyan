// Writes the generated token files. `--check` fails when any of them is out of date (CI runs it).
import { readFileSync, writeFileSync } from "node:fs";
import {
  css,
  color,
  phoneType,
  radius,
  shadow,
  size,
  space,
  spaceColor,
  SPACE_COLORS,
  type,
  motion,
} from "../src/tokens.ts";

const root = new URL("../../../", import.meta.url);
const check = process.argv.includes("--check");
const stale: string[] = [];

function write(relative: string, content: string) {
  const url = new URL(relative, root);
  let current = "";
  try {
    current = readFileSync(url, "utf8");
  } catch {}
  if (current === content) return;
  if (check) stale.push(relative);
  else writeFileSync(url, content);
}

const kebab = (s: string) => s.replace(/[A-Z0-9]+/g, (m) => `-${m.toLowerCase()}`);
const role = (r: (typeof type)["body"]) => `${r.weight} ${r.size}px/${r.line}px var(--font)`;
const em = (n: number) => (n === 0 ? "0" : `${n}em`);

const vars = [
  ...Object.entries(css).map(([k, v]) => `--${kebab(k)}: ${v};`),
  ...SPACE_COLORS.flatMap((c) => [
    `--${c}: ${spaceColor[c].css};`,
    `--${c}-surface: ${spaceColor[c].cssSurface};`,
  ]),
  `--font: "Figtree", ui-sans-serif, system-ui, sans-serif;`,
  ...Object.entries(type).map(([k, r]) => `--${k}: ${role(r)};`),
  ...Object.entries(type).map(([k, r]) => `--tracking-${k}: ${em(r.tracking)};`),
  ...Object.entries(space).map(([k, v]) => `--${k}: ${v}px;`),
  ...Object.entries(radius).map(([k, v]) => `--r-${k}: ${v}px;`),
  `--ctl: ${size.ctl}px;`,
  `--row: ${size.row}px;`,
  `--touch: ${size.touch}px;`,
  `--shadow-raised: ${shadow.raised};`,
  `--shadow-overlay: ${shadow.overlay};`,
  `--out: cubic-bezier(${motion.easeOut.join(", ")});`,
  `--in-out: cubic-bezier(${motion.easeInOut.join(", ")});`,
  `--press: ${motion.press}ms;`,
  `--enter: ${motion.enter}ms;`,
  `--exit: ${motion.exit}ms;`,
];
const phone = [
  `--body: ${role(phoneType.body)};`,
  `--label: ${role(phoneType.label)};`,
  `--meta: ${role(phoneType.meta)};`,
  `--ctl: ${size.touch}px;`,
  `--row: ${size.phoneRow}px;`,
];

write(
  "apps/site/src/app/tokens.css",
  `/* Generated from packages/core/src/tokens.ts by \`bun run tokens\`. Do not edit. */
:root {
  color-scheme: dark;
  ${vars.join("\n  ")}
}
@media (max-width: 760px) {
  :root {
    ${phone.join("\n    ")}
  }
}
`,
);

// Native startup draws before React, so the splash and window colours live in app.json.
const appJsonPath = "apps/app/app.json";
const app = JSON.parse(readFileSync(new URL(appJsonPath, root), "utf8"));
app.expo.backgroundColor = color.bg;
app.expo.android.adaptiveIcon.backgroundColor = color.bg;
app.expo.plugins = app.expo.plugins.map((p: unknown) =>
  Array.isArray(p) && p[0] === "expo-splash-screen"
    ? ["expo-splash-screen", { ...p[1], backgroundColor: color.bg }]
    : p,
);
write(appJsonPath, `${JSON.stringify(app, null, 2)}\n`);

// The web app's page background before React draws, so there is no white flash.
const indexPath = "apps/app/public/index.html";
const index = readFileSync(new URL(indexPath, root), "utf8");
write(indexPath, index.replace(/html, body \{ background: [^;]+;/, `html, body { background: ${color.bg};`));

if (stale.length) {
  console.error(`Generated token files are out of date: ${stale.join(", ")}. Run \`bun run tokens\`.`);
  process.exit(1);
}
console.log(check ? "Token files are up to date." : "Wrote token files.");

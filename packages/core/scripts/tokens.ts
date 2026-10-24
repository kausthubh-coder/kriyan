// Writes the generated token files. `--check` fails when any of them is out of date (CI runs it).
import { readFileSync, writeFileSync } from "node:fs";
import {
  font,
  phoneType,
  radius,
  schemes,
  shadows,
  size,
  space,
  SPACE_COLORS,
  type Scheme,
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

/** The colour variables of one scheme; everything else is the same in both. */
const schemeVars = (scheme: Scheme) => [
  ...Object.entries(schemes[scheme].css).map(([k, v]) => `--${kebab(k)}: ${v};`),
  ...SPACE_COLORS.flatMap((c) => [
    `--${c}: ${schemes[scheme].space[c].css};`,
    `--${c}-surface: ${schemes[scheme].space[c].cssSurface};`,
  ]),
  `--shadow-raised: ${shadows[scheme].raised};`,
  `--shadow-overlay: ${shadows[scheme].overlay};`,
];

const vars = [
  `--font: "${font.family}", ui-sans-serif, system-ui, sans-serif;`,
  ...Object.entries(type).map(([k, r]) => `--${k}: ${role(r)};`),
  ...Object.entries(type).map(([k, r]) => `--tracking-${k}: ${em(r.tracking)};`),
  ...Object.entries(space).map(([k, v]) => `--${k}: ${v}px;`),
  ...Object.entries(radius).map(([k, v]) => `--r-${k}: ${v}px;`),
  `--ctl: ${size.ctl}px;`,
  `--row: ${size.row}px;`,
  `--touch: ${size.touch}px;`,
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
  color-scheme: light;
  ${schemeVars("light").join("\n  ")}
  ${vars.join("\n  ")}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    ${schemeVars("dark").join("\n    ")}
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  ${schemeVars("dark").join("\n  ")}
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
const light = schemes.light.color;
const dark = schemes.dark.color;
app.expo.userInterfaceStyle = "automatic";
app.expo.backgroundColor = light.bg;
// The launcher icon's ground is the Today header's black, like docs/design/brand/build.mjs draws it.
app.expo.android.adaptiveIcon.backgroundColor = light.head;
app.expo.plugins = app.expo.plugins.map((p: unknown) =>
  Array.isArray(p) && p[0] === "expo-splash-screen"
    ? [
        "expo-splash-screen",
        { ...p[1], backgroundColor: light.bg, dark: { ...p[1].dark, backgroundColor: dark.bg } },
      ]
    : p,
);
write(appJsonPath, `${JSON.stringify(app, null, 2)}\n`);

// The web app's page before React draws, so there is no white flash: the background, the
// boot skeleton's colours, and the browser bar's colour in each scheme.
const indexPath = "apps/app/public/index.html";
const index = readFileSync(new URL(indexPath, root), "utf8");
const boot = (t: typeof light) => `--boot-bg: ${t.bg}; --boot-bar: ${t.hover}; --boot-head: ${t.head};`;
const firstPaint = `/* FIRST-PAINT */ html, body { background: ${light.bg}; color-scheme: light; ${boot(light)} } @media (prefers-color-scheme: dark) { html, body { background: ${dark.bg}; color-scheme: dark; ${boot(dark)} } } /* /FIRST-PAINT */`;
const themeColor = `<!-- THEME-COLOR --><meta name="theme-color" media="(prefers-color-scheme: light)" content="${light.bg}" /><meta name="theme-color" media="(prefers-color-scheme: dark)" content="${dark.bg}" /><!-- /THEME-COLOR -->`;
write(
  indexPath,
  index
    .replace(/\/\* FIRST-PAINT \*\/[\s\S]*?\/\* \/FIRST-PAINT \*\//, firstPaint)
    .replace(/<!-- THEME-COLOR -->[\s\S]*?<!-- \/THEME-COLOR -->/, themeColor),
);

// The installed web app (Add to Home Screen, Install app). The splash and title bar take the
// light scheme's background; Chromium reads the dark one from user_preferences, and the
// theme-color tags above override both while the app runs.
write(
  "apps/app/public/manifest.webmanifest",
  `${JSON.stringify(
    {
      name: "Kriyan",
      short_name: "Kriyan",
      description: "A calm planner that turns everything you have to do into a plan for your time.",
      id: "/today",
      start_url: "/today",
      scope: "/",
      display: "standalone",
      orientation: "any",
      background_color: light.bg,
      theme_color: light.bg,
      user_preferences: { color_scheme_dark: { background_color: dark.bg, theme_color: dark.bg } },
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  )}\n`,
);

if (stale.length) {
  console.error(`Generated token files are out of date: ${stale.join(", ")}. Run \`bun run tokens\`.`);
  process.exit(1);
}
console.log(check ? "Token files are up to date." : "Wrote token files.");

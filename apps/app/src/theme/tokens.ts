// The app's theme, built only from @kriyan/core/tokens. On the web every colour is the CSS
// custom property the site uses (so the browser and the Critly check see real tokens), and the
// stylesheet switches light and dark itself; on Android it is the hex value core computes from
// the same oklch source, for the scheme the phone was in when the app started.

import { Appearance, Platform } from "react-native";
import { oklchStringToHex } from "@kriyan/core/color";
import {
  font,
  motion,
  radius,
  schemes,
  shadows as schemeShadows,
  size,
  space,
  SPACE_COLORS,
  type FontWeight,
  type Scheme,
  type SpaceColor,
} from "@kriyan/core/tokens";

export const isWeb = Platform.OS === "web";

/** The scheme this run of the app draws in. A change of system scheme applies on next launch. */
export const scheme: Scheme = startScheme();

function startScheme(): Scheme {
  if (isWeb && typeof window !== "undefined") {
    const forced = document.documentElement.dataset.theme;
    if (forced === "light" || forced === "dark") return forced;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

const tokens = schemes[scheme];
type ColorName = keyof typeof tokens.color;

const kebab = (s: string) => s.replace(/[A-Z0-9]+/g, (m) => `-${m.toLowerCase()}`);

/** Colours for styles: `var(--ink)` on the web, hex on Android. */
export const c = Object.fromEntries(
  (Object.keys(tokens.color) as ColorName[]).map((k) => [k, isWeb ? `var(--${kebab(k)})` : tokens.color[k]]),
) as Record<ColorName, string>;

/** Hex colours, for SVG strokes and fills (SVG attributes can't read CSS variables). */
export const hex = tokens.color;

export interface SpaceTone {
  /** The dot, ring, bar and chart colour. */
  dot: string;
  /** A timeline block's surface. */
  surface: string;
  /** Hex of the dot, for SVG. */
  dotHex: string;
}

export function spaceTone(name: SpaceColor | null | undefined): SpaceTone {
  if (!name) return { dot: c.ink3, surface: c.sunken, dotHex: tokens.color.ink3 };
  return {
    dot: isWeb ? `var(--${name})` : tokens.space[name].dot,
    surface: isWeb ? `var(--${name}-surface)` : tokens.space[name].surface,
    dotHex: tokens.space[name].dot,
  };
}

export { SPACE_COLORS, type SpaceColor };

export const s = space;
export const r = radius;
export const sz = size;
export const m = motion;
export const easeOut = `cubic-bezier(${motion.easeOut.join(", ")})`;

const toNativeShadow = (value: string) => value.replace(/oklch\([^)]*\)/g, (x) => oklchStringToHex(x));

/** Edges from light, not lines. Web reads the scheme's shadow variable; Android gets hex. */
export const shadows = {
  raised: isWeb ? "var(--shadow-raised)" : toNativeShadow(schemeShadows[scheme].raised),
  overlay: isWeb ? "var(--shadow-overlay)" : toNativeShadow(schemeShadows[scheme].overlay),
} as const;

/** Font family per weight. The web registers one "Inter" family with four weights. */
export function family(weight: FontWeight): {
  fontFamily: string;
  fontWeight?: FontWeight;
} {
  if (isWeb)
    return { fontFamily: `${font.family}, ui-sans-serif, system-ui, sans-serif`, fontWeight: weight };
  return {
    fontFamily: {
      "400": "Inter_400Regular",
      "500": "Inter_500Medium",
      "600": "Inter_600SemiBold",
      "700": "Inter_700Bold",
    }[weight],
  };
}

/** The large headings' weight (B2's 700): page titles, the day on Today, a task's title. */
export const bold = family(font.weights.bold);

const schemeVars = (name: Scheme) =>
  [
    ...(Object.keys(schemes[name].css) as ColorName[]).map((k) => `--${kebab(k)}: ${schemes[name].css[k]};`),
    ...SPACE_COLORS.flatMap((sc) => [
      `--${sc}: ${schemes[name].space[sc].css};`,
      `--${sc}-surface: ${schemes[name].space[sc].cssSurface};`,
    ]),
    `--shadow-raised: ${schemeShadows[name].raised};`,
    `--shadow-overlay: ${schemeShadows[name].overlay};`,
  ].join(" ");

/** The web stylesheet: tokens as custom properties for both schemes, the page, focus rings. */
export function webCss(): string {
  return `:root { color-scheme: light; ${schemeVars("light")} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; ${schemeVars("dark")} } }
:root[data-theme="dark"] { color-scheme: dark; ${schemeVars("dark")} }
html, body { background: var(--bg); margin: 0; height: 100%; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
#root { display: flex; min-height: 100%; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--ink-2) !important; outline-offset: 2px; }
input:focus-visible, textarea:focus-visible { outline: none !important; }
:has(> input:focus-visible), :has(> textarea:focus-visible) { outline: 2px solid var(--ink-2); outline-offset: 2px; }
[data-focus="caret"]:has(> input:focus-visible), [data-focus="caret"]:has(> textarea:focus-visible) { outline: none; }
input::placeholder, textarea::placeholder { color: var(--ink-3); opacity: 1; }
::selection { background: var(--line-strong); }
@media (prefers-reduced-motion: reduce) { * { transition-duration: 0ms !important; animation-duration: 0ms !important; } }`;
}

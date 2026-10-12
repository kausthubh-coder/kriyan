// The app's theme, built only from @kriyan/core/tokens. On the web every colour is the CSS
// custom property the site uses (so the browser and the Critly check see real tokens); on
// Android it is the hex value core computes from the same oklch source.

import { Platform } from "react-native";
import { oklchStringToHex } from "@kriyan/core/color";
import {
  color as hexColor,
  css as cssValues,
  font,
  motion,
  radius,
  shadow,
  size,
  space,
  spaceColor,
  SPACE_COLORS,
  type SpaceColor,
} from "@kriyan/core/tokens";

export const isWeb = Platform.OS === "web";

type ColorName = keyof typeof hexColor;

const kebab = (s: string) => s.replace(/[A-Z0-9]+/g, (m) => `-${m.toLowerCase()}`);

/** Colours for styles: `var(--ink)` on the web, hex on Android. */
export const c = Object.fromEntries(
  (Object.keys(hexColor) as ColorName[]).map((k) => [k, isWeb ? `var(--${kebab(k)})` : hexColor[k]]),
) as Record<ColorName, string>;

/** Hex colours, for SVG strokes and fills (SVG attributes can't read CSS variables). */
export const hex = hexColor;

export interface SpaceTone {
  /** The dot, ring, bar and chart colour. */
  dot: string;
  /** A timeline block's surface. */
  surface: string;
  /** Hex of the dot, for SVG. */
  dotHex: string;
}

export function spaceTone(name: SpaceColor | null | undefined): SpaceTone {
  if (!name) return { dot: c.ink3, surface: c.raised, dotHex: hexColor.ink3 };
  return {
    dot: isWeb ? `var(--${name})` : spaceColor[name].dot,
    surface: isWeb ? `var(--${name}-surface)` : spaceColor[name].surface,
    dotHex: spaceColor[name].dot,
  };
}

export { SPACE_COLORS, type SpaceColor };

export const s = space;
export const r = radius;
export const sz = size;
export const m = motion;
export const easeOut = `cubic-bezier(${motion.easeOut.join(", ")})`;

const toNativeShadow = (value: string) => value.replace(/oklch\([^)]*\)/g, (x) => oklchStringToHex(x));

/** Edges from light, not lines. Web reads the oklch shadow; Android gets hex. */
export const shadows = {
  raised: isWeb ? shadow.raised : toNativeShadow(shadow.raised),
  overlay: isWeb ? shadow.overlay : toNativeShadow(shadow.overlay),
} as const;

/** Font family per weight. The web registers one "Figtree" family with three weights. */
export function family(weight: "400" | "500" | "600"): { fontFamily: string; fontWeight?: "400" | "500" | "600" } {
  if (isWeb) return { fontFamily: `${font.family}, ui-sans-serif, system-ui, sans-serif`, fontWeight: weight };
  return {
    fontFamily: { "400": "Figtree_400Regular", "500": "Figtree_500Medium", "600": "Figtree_600SemiBold" }[weight],
  };
}

/** The web stylesheet: tokens as custom properties, the page background, focus rings. */
export function webCss(): string {
  const vars = [
    ...(Object.keys(hexColor) as ColorName[]).map((k) => `--${kebab(k)}: ${cssColor(k)};`),
    ...SPACE_COLORS.flatMap((name) => [
      `--${name}: ${spaceColor[name].css};`,
      `--${name}-surface: ${spaceColor[name].cssSurface};`,
    ]),
  ];
  return `:root { color-scheme: dark; ${vars.join(" ")} }
html, body { background: var(--bg); margin: 0; height: 100%; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
#root { display: flex; min-height: 100%; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--ink-2) !important; outline-offset: 2px; }
input::placeholder, textarea::placeholder { color: var(--ink-3); opacity: 1; }
::selection { background: var(--line-strong); }
@media (prefers-reduced-motion: reduce) { * { transition-duration: 0ms !important; animation-duration: 0ms !important; } }`;
}

function cssColor(name: ColorName): string {
  return cssValues[name];
}

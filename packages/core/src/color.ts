// OKLCH to sRGB hex, for platforms that can't read oklch() (React Native).

export function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  return `#${[r, g, bl].map((v) => channel(v)).join("")}`;
}

function channel(linear: number): string {
  const v = Math.min(1, Math.max(0, linear));
  const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255)
    .toString(16)
    .padStart(2, "0");
}

/** Parses "oklch(L% C H)" or "oklch(L% C H / A)" and returns hex (alpha as #rrggbbaa). */
export function oklchStringToHex(value: string): string {
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(value);
  if (!m) throw new Error(`Not an oklch() colour: ${value}`);
  const hex = oklchToHex(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
  if (m[4] === undefined) return hex;
  return (
    hex +
    Math.round(Number(m[4]) * 255)
      .toString(16)
      .padStart(2, "0")
  );
}

/** WCAG contrast ratio between two "#rrggbb" colours. */
export function contrast(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [x, y] = [lum(hexA), lum(hexB)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

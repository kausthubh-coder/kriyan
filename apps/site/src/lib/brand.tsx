// The logo, in one place. The header mark, the favicon, the Apple icon and the social image all
// draw from here, so switching to another direction is changing CURRENT below.
// Sources and the comparison page: docs/design/brand/.

export type MarkName = "ring" | "k-dot" | "day-line" | "k-line";

/** The direction in use: an open ring, the day, with now as the red dot in its gap (chosen 24 Oct 2026). */
export const CURRENT: MarkName = "ring";

/** The red "now" dot on a light ground: the app's light `now` token. */
export const NOW_RED = "#c93126";
/** The same red on the black icon ground: the dark `now` token, which holds up on black. */
export const NOW_RED_ON_DARK = "#f75e54";
/** App icon ground and ink: the black of the app's Today header. */
export const ICON_BG = "#070708";
export const ICON_INK = "#ffffff";

/**
 * Each mark drawn on a 24-unit square. `ink` is the letter or line colour; `dot` is the now-dot,
 * which turns into ink for monochrome uses (Android's themed icon, a one-colour print).
 * A plain function, not a component: the icon renderer (next/og) only takes plain SVG elements
 * inside <svg>.
 */
export function markPaths({ name = CURRENT, ink, dot }: { name?: MarkName; ink: string; dot: string }) {
  if (name === "ring") {
    return (
      <g>
        <path
          d="M19.78 11.46A7.8 7.8 0 1 1 12.54 4.22"
          fill="none"
          stroke={ink}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="17.52" cy="6.48" r="2.6" fill={dot} />
      </g>
    );
  }
  if (name === "day-line") {
    return (
      <g fill="none" stroke={ink} strokeLinecap="round">
        <path d="M6 3v18" strokeWidth="2.2" />
        <path d="M10 5.5h6.5M10 9.5h9M10 17.5h5" strokeWidth="2.6" />
        <circle cx="6" cy="13.5" r="2.6" fill={dot} stroke="none" />
      </g>
    );
  }
  if (name === "k-line") {
    return (
      <g fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 3.5v17" strokeWidth="3" />
        <path d="M18 3.5 9.6 12 18.5 20.5" strokeWidth="3" />
        <circle cx="9.6" cy="12" r="2.9" fill={dot} stroke="none" />
      </g>
    );
  }
  return (
    <g>
      <path fill={ink} d="M3.6 3.5h3.9v6.6l6-6.6h4.7l-6.6 7 7 9.9h-4.7l-5-7.2-1.4 1.5v5.7H3.6z" />
      <circle cx="20.6" cy="5.4" r="2" fill={dot} />
    </g>
  );
}

/** The mark alone, as an inline SVG. */
export function BrandMark({
  size = 22,
  ink = "currentColor",
  // The page's own red, so the dot follows light and dark; next/og passes a colour instead.
  dot = "var(--now)",
  title,
  name = CURRENT,
}: {
  size?: number;
  ink?: string;
  dot?: string;
  title?: string;
  name?: MarkName;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {markPaths({ name, ink, dot })}
    </svg>
  );
}

/**
 * The app icon: the mark on the black ground, sized so it sits inside Android's 66% safe zone
 * when the same artwork is used as an adaptive icon.
 */
export function AppIcon({ size, name = CURRENT }: { size: number; name?: MarkName }) {
  const inner = Math.round(size * 0.56);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BG,
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 24 24">
        {markPaths({ name, ink: ICON_INK, dot: NOW_RED_ON_DARK })}
      </svg>
    </div>
  );
}

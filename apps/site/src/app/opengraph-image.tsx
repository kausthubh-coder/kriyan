import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { color } from "@kriyan/core/tokens";
import { HEADLINE } from "@/lib/site";

export const alt = `Kriyan: ${HEADLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated at build time: dark page, the ensō and the headline, in Figtree.
export default async function OpenGraphImage() {
  const [medium, semibold] = await Promise.all([
    readFile(join(process.cwd(), "assets/figtree-latin-500.woff")),
    readFile(join(process.cwd(), "assets/figtree-latin-600.woff")),
  ]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 96,
          background: color.bg,
          color: color.ink,
          fontFamily: "Figtree",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 48, fontWeight: 600, letterSpacing: "-0.02em" }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill={color.ink}>
            <path d="M21.00 10.09A9.2 9.2 0 1 1 15.15 3.35L14.83 4.97A6.35 6.35 0 1 0 18.87 9.62Z" />
            <circle cx="19.94" cy="9.85" r="1.09" />
            <circle cx="14.99" cy="4.16" r="0.82" />
          </svg>
          kriyan
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: 900 }}>
            {HEADLINE}
          </div>
          <div style={{ fontSize: 32, fontWeight: 500, color: color.ink3 }}>
            Your plan for the day, and your AI to plan it with.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Figtree", data: medium, weight: 500, style: "normal" },
        { name: "Figtree", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}

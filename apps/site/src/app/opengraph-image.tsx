import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BrandMark, NOW_RED } from "@/lib/brand";
import { HEADLINE } from "@/lib/site";

export const alt = `Kriyan: ${HEADLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Light page, the mark and the headline in Inter, two-toned like the app's greeting.
// Cached, so the image is rendered once at build time instead of on every request.
async function loadFonts(): Promise<[Uint8Array, Uint8Array]> {
  "use cache";
  const [medium, bold] = await Promise.all([
    readFile(join(process.cwd(), "assets/inter-latin-500.woff")),
    readFile(join(process.cwd(), "assets/inter-latin-700.woff")),
  ]);
  return [Uint8Array.from(medium), Uint8Array.from(bold)];
}

export default async function OpenGraphImage() {
  const [medium, bold] = await loadFonts();
  const [lead, rest] = HEADLINE.split(", ");
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 96,
        background: "#ffffff",
        color: "#111113",
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: "-0.03em",
        }}
      >
        <BrandMark size={52} ink="#111113" dot={NOW_RED} />
        Kriyan
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 92,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: "-0.04em",
          }}
        >
          <span>{rest ? `${lead},` : HEADLINE}</span>
          {rest ? <span style={{ color: "#76767b" }}>{rest}</span> : null}
        </div>
        <div style={{ fontSize: 32, fontWeight: 500, color: "#6a6a6f" }}>
          Tasks, events, habits and goals on one timeline. Your AI plans with you.
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Inter", data: medium.buffer as ArrayBuffer, weight: 500, style: "normal" },
        { name: "Inter", data: bold.buffer as ArrayBuffer, weight: 700, style: "normal" },
      ],
    },
  );
}

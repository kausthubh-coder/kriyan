import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// The favicon: the app icon tile, so it reads on light and dark browser tabs alike.
export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", borderRadius: 14, overflow: "hidden" }}>
      <AppIcon size={64} />
    </div>,
    size,
  );
}

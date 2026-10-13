import { ImageResponse } from "next/og";
import { color } from "@kriyan/core/tokens";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The Android icon at Apple's touch-icon size: the ensō on the page colour.
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: color.bg,
      }}
    >
      <svg width="100" height="100" viewBox="0 0 24 24" fill={color.ink}>
        <path d="M21.00 10.09A9.2 9.2 0 1 1 15.15 3.35L14.83 4.97A6.35 6.35 0 1 0 18.87 9.62Z" />
        <circle cx="19.94" cy="9.85" r="1.09" />
        <circle cx="14.99" cy="4.16" r="0.82" />
      </svg>
    </div>,
    size,
  );
}

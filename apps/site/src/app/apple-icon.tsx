import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The Home Screen icon on iPhone: the app icon from src/lib/brand.tsx.
export default function AppleIcon() {
  return new ImageResponse(<AppIcon size={180} />, size);
}

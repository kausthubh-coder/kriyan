// Lucide, 1.75 stroke, 18px beside 14px text. Colours are hex because SVG attributes can't
// read CSS variables.

import type { LucideIcon } from "lucide-react-native";
import { hex } from "@/theme/tokens";

export type IconTone = "ink" | "ink2" | "ink3" | "now" | "onInk";

interface Props {
  icon: LucideIcon;
  size?: number;
  tone?: IconTone;
  /** A raw hex colour, for space colours. */
  color?: string;
  strokeWidth?: number;
}

export function Icon({ icon: Glyph, size = 18, tone = "ink3", color, strokeWidth = 1.75 }: Props) {
  return (
    <Glyph
      size={size}
      color={color ?? hex[tone]}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth={false}
      aria-hidden
      focusable={false}
    />
  );
}

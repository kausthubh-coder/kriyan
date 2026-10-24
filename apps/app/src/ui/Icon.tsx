// Lucide, 1.75 stroke, 18px beside 14px text. Colours are hex because SVG attributes can't
// read CSS variables. Icons sit beside text, so they grow with the system text size, up to 1.5x
// (past that a row's icons would crowd its words; the words keep growing).

import { useWindowDimensions } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { hex } from "@/theme/tokens";

export type IconTone = "ink" | "ink2" | "ink3" | "now" | "onInk" | "headInk" | "headDim" | "parse" | "done";

/** The largest text-size step icons follow. */
const MAX_SCALE = 1.5;

interface Props {
  icon: LucideIcon;
  size?: number;
  tone?: IconTone;
  /** A raw hex colour, for space colours. */
  color?: string;
  strokeWidth?: number;
  /** Solid, like B2's play mark. */
  filled?: boolean;
}

export function Icon({ icon: Glyph, size = 18, tone = "ink3", color, strokeWidth = 1.75, filled }: Props) {
  const { fontScale } = useWindowDimensions();
  const scale = Math.min(Math.max(fontScale, 1), MAX_SCALE);
  const ink = color ?? hex[tone];
  return (
    <Glyph
      size={Math.round(size * scale)}
      color={ink}
      fill={filled ? ink : "none"}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth={false}
      aria-hidden
      focusable={false}
    />
  );
}

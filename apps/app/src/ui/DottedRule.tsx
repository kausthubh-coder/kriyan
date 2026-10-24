// B2's dotted rule along one edge of a row (b2.html `.row`). Android draws a dotted border only
// when all four sides share it, so a one-sided dotted border comes out solid there. This draws a
// whole dotted box and shows one edge of it through a 1px window. DottedRule.web.tsx is the plain
// border the browser draws itself.

import { View } from "react-native";
import { c } from "@/theme/tokens";

export interface DottedRuleProps {
  /** The edge it sits on; the parent is the row, so the rule takes its full width or height. */
  edge?: "bottom" | "top" | "left";
  color?: string;
  /** Line thickness; the spine on Today is 2. */
  width?: number;
  /** For a vertical rule placed by hand (the spine), its offset from the parent's left. */
  inset?: { left?: number; top?: number; bottom?: number };
}

export function DottedRule({ edge = "bottom", color = c.lineStrong, width = 1, inset }: DottedRuleProps) {
  const vertical = edge === "left";
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={{
        position: "absolute",
        overflow: "hidden",
        ...(vertical
          ? { left: inset?.left ?? 0, top: inset?.top ?? 0, bottom: inset?.bottom ?? 0, width }
          : { left: 0, right: 0, height: width, [edge]: 0 }),
      }}
    >
      <View
        style={{
          borderWidth: width,
          borderStyle: "dotted",
          borderColor: color,
          ...(vertical
            ? { flex: 1, width: width * 3 }
            : { height: width * 3, marginTop: edge === "bottom" ? -width * 2 : 0 }),
        }}
      />
    </View>
  );
}

// B2's dotted rule along one edge of a row. Browsers draw a one-sided dotted border, so this is
// the plain border; DottedRule.tsx explains why Android needs more.

import { View } from "react-native";
import { c } from "@/theme/tokens";
import type { DottedRuleProps } from "./DottedRule";

export function DottedRule({ edge = "bottom", color = c.lineStrong, width = 1, inset }: DottedRuleProps) {
  const vertical = edge === "left";
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={{
        position: "absolute",
        borderStyle: "dotted",
        borderColor: color,
        ...(vertical
          ? {
              left: inset?.left ?? 0,
              top: inset?.top ?? 0,
              bottom: inset?.bottom ?? 0,
              borderLeftWidth: width,
            }
          : edge === "top"
            ? { left: 0, right: 0, top: 0, borderTopWidth: width }
            : { left: 0, right: 0, bottom: 0, borderBottomWidth: width }),
      }}
    />
  );
}

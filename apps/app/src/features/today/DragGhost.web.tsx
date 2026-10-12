// The lifted task following the pointer (web).

import { View } from "react-native";
import { c, r, s, shadows } from "@/theme/tokens";
import { Dot } from "@/ui/bits";
import { Txt } from "@/ui/Txt";
import { externalDrag } from "./drag";

export function DragGhost() {
  const drag = externalDrag.useValue((d) => d);
  if (!drag) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "fixed" as "absolute",
        left: drag.x + 12,
        top: drag.y + 8,
        zIndex: 30,
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        maxWidth: 280,
        paddingVertical: s.s1,
        paddingHorizontal: s.s3,
        borderRadius: r.ctl,
        backgroundColor: c.overlay,
        boxShadow: shadows.overlay,
      }}
    >
      <Dot color={drag.color} />
      <Txt variant="label" numberOfLines={1}>
        {drag.title}
      </Txt>
    </View>
  );
}

// The lifted task following the finger (Android), positioned on the UI thread.

import { useRef } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { c, r, s, shadows } from "@/theme/tokens";
import { Dot } from "@/ui/bits";
import { Txt } from "@/ui/Txt";
import { externalDrag } from "./drag";
import { dragging, fingerX, fingerY } from "./DragSource";

/** Render once at the root of the screen; it measures where that root sits on screen. */
export function DragGhost() {
  const drag = externalDrag.useValue((d) => d);
  const ref = useRef<View>(null);
  const origin = useSharedValue({ x: 0, y: 0 });
  const style = useAnimatedStyle(() => ({
    opacity: dragging.value,
    transform: [{ translateX: fingerX.value - origin.value.x - 40 }, { translateY: fingerY.value - origin.value.y - 56 }],
  }));
  return (
    <View
      ref={ref}
      pointerEvents="none"
      onLayout={() => ref.current?.measureInWindow((x, y) => (origin.value = { x, y }))}
      style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 30 }}
    >
      {drag ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              flexDirection: "row",
              alignItems: "center",
              gap: s.s2,
              maxWidth: 260,
              paddingVertical: s.s2,
              paddingHorizontal: s.s3,
              borderRadius: r.ctl,
              backgroundColor: c.overlay,
              boxShadow: shadows.overlay,
            },
            style,
          ]}
        >
          <Dot color={drag.color} />
          <Txt variant="label" numberOfLines={1}>
            {drag.title}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}

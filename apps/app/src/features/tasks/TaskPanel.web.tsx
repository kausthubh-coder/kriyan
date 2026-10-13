// Web: the task opens in a side panel that slides in from the right without covering the
// column (desktop), or a bottom sheet over a scrim (below 760px).

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows, sz } from "@/theme/tokens";
import { panelOpenedByKeyboard } from "./panelState";

const slideIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 24 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }] },
}).duration(220);
const sheetIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 40 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(220);

export function TaskPanel({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const phone = useIsPhone();
  // Opened with the keyboard: no animation (frequent and intentional).
  const animate = !panelOpenedByKeyboard.get();
  if (phone) {
    return (
      <View style={{ flex: 1 }}>
        <Animated.View entering={animate ? FadeIn.duration(150) : undefined} style={{ position: "absolute", inset: 0, backgroundColor: c.scrim, zIndex: 10 } as object}>
          <Pressable accessibilityLabel="Close task" onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          entering={animate ? sheetIn : undefined}
          role="dialog"
          aria-label={label}
          aria-modal
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "88%",
            zIndex: 11,
            backgroundColor: c.raised,
            borderTopLeftRadius: r.sheet,
            borderTopRightRadius: r.sheet,
            boxShadow: shadows.overlay,
          }}
        >
          <View style={{ alignItems: "center", paddingTop: s.s3 }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
          </View>
          {children}
        </Animated.View>
      </View>
    );
  }
  return (
    <View pointerEvents="box-none" style={{ flex: 1 }}>
      <Animated.View
        entering={animate ? slideIn : undefined}
        role="complementary"
        aria-label={label}
        style={{
          position: "fixed" as "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: sz.panel,
          zIndex: 5,
          backgroundColor: c.raised,
          boxShadow: shadows.overlay,
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

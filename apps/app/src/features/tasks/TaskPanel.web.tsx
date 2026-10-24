// Web: the task opens in a side panel that slides in from the right without covering the
// column (desktop), or a bottom sheet with two heights over a scrim (below 760px).

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  Keyframe,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows, sz } from "@/theme/tokens";
import { useInertOutside } from "@/ui/inert";
import { Press } from "@/ui/Press";
import { panelOpenedByKeyboard } from "./panelState";

const slideIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 24 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }] },
}).duration(220);
const sheetIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 40 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(220);

export function TaskPanel({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  const phone = useIsPhone();
  // Opened with the keyboard: no animation (frequent and intentional).
  const animate = !panelOpenedByKeyboard.get();
  // On phones the sheet is modal; on desktop the panel sits beside the column, which stays usable.
  const layer = useRef<View>(null);
  useInertOutside(layer, phone);
  const passRef = useRef<View>(null);
  usePassThrough(passRef, !phone);
  if (phone) {
    return (
      <View ref={layer} style={{ flex: 1 }}>
        <Animated.View
          entering={animate ? FadeIn.duration(150) : undefined}
          style={{ position: "absolute", inset: 0, backgroundColor: c.scrim, zIndex: 10 } as object}
        >
          <Pressable accessibilityLabel="Close task" onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Sheet animate={animate} label={label} onClose={onClose}>
          {children}
        </Sheet>
      </View>
    );
  }
  return (
    <View ref={passRef} pointerEvents="box-none" style={{ flex: 1 }}>
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
          pointerEvents: "auto",
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** The sheet's two heights, as parts of the window (b2.html `detentY`): it opens at the first. */
const MEDIUM = 0.64;
const LARGE = 0.94;

/**
 * The phone's task sheet: opens at medium height; drag the grabber up for the full height,
 * down to make it smaller or close it. Tapping the grabber switches between the two.
 */
function Sheet({
  children,
  animate,
  label,
  onClose,
}: {
  children: ReactNode;
  animate: boolean;
  label: string;
  onClose: () => void;
}) {
  const { height: win } = useWindowDimensions();
  const [large, setLarge] = useState(false);
  const h = useSharedValue(win * MEDIUM);
  const from = useSharedValue(0);
  const snap = (toLarge: boolean) => {
    setLarge(toLarge);
    h.value = withTiming(win * (toLarge ? LARGE : MEDIUM), { duration: 220 });
  };
  const pan = Gesture.Pan()
    .activeOffsetY([-4, 4])
    .onBegin(() => {
      from.value = h.value;
    })
    .onUpdate((e) => {
      h.value = Math.min(win * LARGE, Math.max(win * 0.2, from.value - e.translationY));
    })
    .onEnd((e) => {
      const medium = win * MEDIUM;
      // Pulled well below medium, or flicked down from it: close.
      if (h.value < medium * 0.75 || (e.velocityY > 1200 && from.value <= medium + 1)) scheduleOnRN(onClose);
      else
        scheduleOnRN(snap, e.velocityY < -600 || (e.velocityY < 600 && h.value > (medium + win * LARGE) / 2));
    });
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <Animated.View
      entering={animate ? sheetIn : undefined}
      role="dialog"
      aria-label={label}
      aria-modal
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 11,
          backgroundColor: c.raised,
          borderTopLeftRadius: r.sheet,
          borderTopRightRadius: r.sheet,
          boxShadow: shadows.overlay,
        },
        style,
      ]}
    >
      <GestureDetector gesture={pan}>
        <View style={{ alignItems: "center", touchAction: "none" } as object}>
          <Press
            role="button"
            accessibilityLabel={large ? "Make smaller" : "Expand"}
            onPress={() => snap(!large)}
            hoverBg={null}
            scale={false}
            style={{
              width: 96,
              height: 44,
              marginBottom: -s.s4,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
          </Press>
        </View>
      </GestureDetector>
      {children}
    </Animated.View>
  );
}

/**
 * The panel's route is drawn over the screen behind it. Its wrappers fill the window, so
 * clicks and focus checks would land on them; let them pass through to the column.
 */
function usePassThrough(ref: RefObject<View | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const changed: HTMLElement[] = [];
    let node = (ref.current as unknown as HTMLElement | null)?.parentElement ?? null;
    // Up to the stack, whose children are the screens.
    while (node && node.parentElement && node.parentElement.childElementCount < 2 && node !== document.body) {
      changed.push(node);
      node = node.parentElement;
    }
    if (node && node !== document.body) changed.push(node);
    for (const el of changed) el.style.pointerEvents = "none";
    return () => {
      for (const el of changed) el.style.pointerEvents = "";
    };
  }, [ref, active]);
}

// Web: a task opens as Joi's floating card over a scrim (phones) or in the panel on the right
// (desktop, the column stays usable). Edit is a page of its own on phones and a box in the
// middle of the window on desktop.

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows } from "@/theme/tokens";
import { useInertOutside } from "@/ui/inert";
import { panelOpenedByKeyboard } from "./panelState";

const slideIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 24 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }] },
}).duration(220);
const cardIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 40 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(240);

export function TaskPanel({
  children,
  onClose,
  label,
  mode = "card",
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  mode?: "card" | "edit";
}) {
  const phone = useIsPhone();
  const { height } = useWindowDimensions();
  // Opened with the keyboard: no animation (frequent and intentional).
  const animate = !panelOpenedByKeyboard.get();
  const layer = useRef<View>(null);
  const modal = phone || mode === "edit";
  useInertOutside(layer, modal);
  const passRef = useRef<View>(null);
  usePassThrough(passRef, !modal);

  if (phone && mode === "edit")
    return (
      <View
        ref={layer}
        role="dialog"
        aria-modal
        aria-label={label}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        {children}
      </View>
    );

  if (modal) {
    const scrim = (
      <Animated.View
        entering={animate ? FadeIn.duration(150) : undefined}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }}
      >
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
      </Animated.View>
    );
    return (
      <View style={{ position: "fixed" as "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}>
        {scrim}
        <Animated.View
          ref={layer}
          entering={animate ? (phone ? cardIn : FadeIn.duration(150)) : undefined}
          role="dialog"
          aria-modal
          aria-label={label}
          style={
            phone
              ? {
                  position: "absolute",
                  left: s.s3,
                  right: s.s3,
                  bottom: s.s3,
                  maxHeight: height - s.s12,
                  borderRadius: r.float,
                  backgroundColor: c.sunken,
                  boxShadow: shadows.overlay,
                  overflow: "hidden",
                }
              : {
                  position: "absolute",
                  top: "6%",
                  alignSelf: "center",
                  width: 460,
                  maxWidth: "92%",
                  height: Math.min(720, height * 0.88),
                  borderRadius: r.sheet,
                  backgroundColor: c.bg,
                  boxShadow: shadows.overlay,
                  overflow: "hidden",
                }
          }
        >
          {phone ? (
            <ScrollView
              contentContainerStyle={{ padding: s.s6, paddingTop: s.s8 }}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
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
          width: 360,
          zIndex: 5,
          backgroundColor: c.bg,
          borderLeftWidth: 1,
          borderLeftColor: c.line,
          pointerEvents: "auto",
        }}
      >
        <ScrollView contentContainerStyle={{ padding: s.s6, paddingBottom: s.s12 }}>{children}</ScrollView>
      </Animated.View>
    </View>
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

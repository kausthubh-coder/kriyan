// A small layer for choices. Desktop: anchored under (or beside) its trigger, closes on an
// outside click or Escape. Phones: a bottom sheet with a handle and a scrim. Focus stays
// inside while it's open and the rest of the screen is inert.

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows } from "@/theme/tokens";
import { Txt } from "./Txt";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The control that opened it, for placement on desktop. */
  anchor?: RefObject<View | null>;
  /** Place to the left of the anchor (the task panel's editors) instead of below it. */
  side?: "below" | "left";
  title: string;
  width?: number;
  children: ReactNode;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function Popover({ open, onClose, anchor, side = "below", title, width = 320, children }: Props) {
  const phone = useIsPhone();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!open || phone || !anchor?.current) return;
    anchor.current.measureInWindow((x, y, w, h) => setBox({ x, y, width: w, height: h }));
  }, [open, phone, anchor]);

  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  if (phone) {
    return (
      <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={{ flex: 1, backgroundColor: c.scrim }}>
          <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
          <Animated.View
            entering={SlideInDown.duration(220)}
            role="dialog"
            aria-label={title}
            aria-modal
            style={{
              maxHeight: win.height * 0.85,
              backgroundColor: c.overlay,
              borderTopLeftRadius: r.sheet,
              borderTopRightRadius: r.sheet,
              paddingBottom: insets.bottom + s.s4,
            }}
          >
            <View style={{ alignItems: "center", paddingTop: s.s3, paddingBottom: s.s2 }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
            </View>
            <Txt variant="subhead" heading={2} style={{ paddingHorizontal: s.s4, paddingBottom: s.s2 }}>
              {title}
            </Txt>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: s.s4, gap: s.s3 }}>
              {children}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>
    );
  }

  const left = box
    ? side === "left"
      ? Math.max(s.s3, box.x - width - s.s3)
      : Math.min(Math.max(s.s3, box.x), win.width - width - s.s3)
    : (win.width - width) / 2;
  const top = box ? (side === "left" ? Math.max(s.s3, box.y - s.s3) : box.y + box.height + s.s1) : win.height * 0.2;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: "absolute", inset: 0 } as object} focusable={false} />
      <Animated.View
        entering={FadeIn.duration(150)}
        role="dialog"
        aria-label={title}
        aria-modal
        style={{
          position: "absolute",
          left,
          top,
          width,
          maxHeight: win.height - top - s.s6,
          padding: s.s3,
          gap: s.s3,
          borderRadius: r.card,
          backgroundColor: c.overlay,
          boxShadow: shadows.overlay,
        }}
      >
        <ScrollView contentContainerStyle={{ gap: s.s3 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

/** A row in a popover list. */
export function PopRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>{children}</View>;
}

// A small layer for choices. Desktop: anchored under (or beside) its trigger, closes on an
// outside click or Escape. Phones: a bottom sheet with a handle and a scrim. Focus stays
// inside while it's open and the rest of the screen is inert.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type } from "@kriyan/core/tokens";
import { roleStyle, useIsPhone } from "@/theme/layout";
import { bold, c, family, r, s, shadows } from "@/theme/tokens";
import { useInertOutside } from "./inert";
import { Txt } from "./Txt";
import { Grabber } from "./bits";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The control that opened it, for placement on desktop. */
  anchor?: RefObject<View | null>;
  /** Place to the left of the anchor (the task panel's editors) instead of below it. */
  /** "above" grows up from the trigger, for menus at the bottom of a panel. */
  side?: "below" | "left" | "above";
  title: string;
  width?: number;
  /** A "Done" button in the phone sheet's head (B2's field pickers), which closes it. */
  done?: boolean;
  children: ReactNode;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function Popover({
  open,
  onClose,
  anchor,
  side = "below",
  title,
  width = 320,
  done,
  children,
}: Props) {
  const phone = useIsPhone();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState<Box | null>(null);
  const layer = useRef<View>(null);
  useInertOutside(layer, open);

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
      <Modal
        transparent
        visible
        animationType="none"
        onRequestClose={onClose}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={{ flex: 1, backgroundColor: c.scrim }}
        >
          <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
          {/* Pinned to the bottom edge by position, not by the flex column above it: on Android
              the column came out short and the sheet ended ~200px above the bottom (D15). */}
          <Animated.View
            ref={layer}
            entering={SlideInDown.duration(220)}
            role="dialog"
            aria-label={title}
            aria-modal
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: win.height * 0.85,
              backgroundColor: c.overlay,
              borderTopLeftRadius: r.sheet,
              borderTopRightRadius: r.sheet,
              paddingBottom: insets.bottom + s.s4,
            }}
          >
            <View style={{ alignItems: "center", paddingTop: s.s2 }}>
              <Grabber />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s.s2,
                minHeight: 52,
                paddingHorizontal: s.s4,
              }}
            >
              <Txt variant="subhead" heading={2} style={[bold, { flex: 1 }]}>
                {title}
              </Txt>
              {done ? <DoneButton onPress={onClose} /> : null}
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: s.s4, gap: s.s3 }}
            >
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
      : side === "above"
        ? Math.min(Math.max(s.s3, box.x + box.width - width), win.width - width - s.s3)
        : Math.min(Math.max(s.s3, box.x), win.width - width - s.s3)
    : (win.width - width) / 2;
  const top = box
    ? side === "left"
      ? Math.max(s.s3, box.y - s.s3)
      : box.y + box.height + s.s1
    : win.height * 0.2;
  // Above: pinned by its bottom edge just over the trigger, so it grows upward.
  const vertical =
    box && side === "above"
      ? { bottom: win.height - box.y + s.s1, maxHeight: box.y - s.s6 }
      : { top, maxHeight: win.height - top - s.s6 };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ position: "absolute", inset: 0 } as object}
        focusable={false}
        {...({ tabIndex: -1 } as object)}
      />
      <Animated.View
        ref={layer}
        entering={FadeIn.duration(150)}
        role="dialog"
        aria-label={title}
        aria-modal
        style={{
          position: "absolute",
          left,
          ...vertical,
          width,
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

/** B2's small dark "Done" (`.btn-sm.dark`) in a picker's head. */
export function DoneButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel="Done"
      onPress={onPress}
      style={{
        minHeight: 34,
        justifyContent: "center",
        paddingHorizontal: s.s3,
        borderRadius: r.pill,
        backgroundColor: c.ink,
      }}
      hitSlop={5}
    >
      <Txt tone="onInk" style={doneText}>
        Done
      </Txt>
    </Pressable>
  );
}

/** 14 on both layouts, like B2's small buttons. */
const doneText = { ...roleStyle(type.label), ...family("600") };

/** A row in a popover list. */
export function PopRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>{children}</View>;
}

// The pull-down summary (v5 `.curtain`): the day in one black sentence, the counts and the free
// time strong. Phones pull it down over Today (or tap the day); desktop shows it as a card.

import { useEffect, useRef } from "react";
import { Modal, Platform, Pressable, View, type TextStyle } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { weekday } from "@kriyan/core/dates";
import { MONTH_LONG, WEEKDAY_SHORT } from "@kriyan/core/format";
import type { SentencePart } from "@kriyan/core/today";
import { useIsPhone } from "@/theme/layout";
import { c, r, s } from "@/theme/tokens";
import { Grabber } from "@/ui/bits";
import { useInertOutside } from "@/ui/inert";
import { Txt } from "@/ui/Txt";
import { T, ty } from "./parts";

export function Sentence({ parts, style }: { parts: SentencePart[]; style?: TextStyle }) {
  return (
    <Txt
      style={[ty.sentence, { color: c.headDim }, style]}
      accessibilityLabel={parts.map((p) => p.text).join("")}
    >
      {parts.map((p, i) => (
        <Txt key={i} style={[ty.sentence, style, { color: p.strong ? c.headInk : c.headDim }]}>
          {p.text}
        </Txt>
      ))}
    </Txt>
  );
}

export function Curtain({
  open,
  onClose,
  today,
  parts,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
  parts: SentencePart[];
}) {
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  const layer = useRef<View>(null);
  useInertOutside(layer, open);
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const body = phone ? (
    <Pressable
      accessibilityLabel="Close the summary"
      onPress={onClose}
      style={{ flex: 1, backgroundColor: c.head, paddingTop: insets.top + s.s6 }}
    >
      <StatusBar style="light" />
      <Animated.View entering={FadeIn.duration(200)} role="dialog" aria-label="Summary" style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            paddingHorizontal: s.s6,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
            <Txt style={[ty.day, { color: c.headInk }]}>{WEEKDAY_SHORT[weekday(today)]}</Txt>
            <View
              style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.now, marginTop: s.s2 }}
            />
          </View>
          <T s="date" tone="headDim" extra={{ textAlign: "right" }}>
            {`${d} ${MONTH_LONG[m - 1]}\n${y}`}
          </T>
        </View>
        <View style={{ paddingHorizontal: s.s6, paddingTop: s.s8 }}>
          <Sentence parts={parts} />
        </View>
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 200 + insets.bottom,
            backgroundColor: c.bg,
            borderTopLeftRadius: r.float,
            borderTopRightRadius: r.float,
            alignItems: "center",
            paddingTop: s.s3,
          }}
        >
          <Grabber />
          <T s="body" tone="ink3" extra={{ marginTop: s.s4 }}>
            Tap anywhere to close
          </T>
        </View>
      </Animated.View>
    </Pressable>
  ) : (
    <Pressable
      accessibilityLabel="Close the summary"
      onPress={onClose}
      style={{ flex: 1, backgroundColor: c.scrim }}
    >
      <Animated.View
        entering={FadeIn.duration(150)}
        role="dialog"
        aria-label="Summary"
        style={{
          position: "absolute",
          top: "16%",
          alignSelf: "center",
          width: 460,
          maxWidth: "92%",
          paddingVertical: s.s8,
          paddingHorizontal: s.s8,
          borderRadius: r.sheet,
          backgroundColor: c.head,
        }}
      >
        <Sentence parts={parts} />
      </Animated.View>
    </Pressable>
  );
  if (Platform.OS === "web")
    return (
      <View
        ref={layer}
        style={{ position: "fixed" as "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }}
      >
        {body}
      </View>
    );
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {body}
    </Modal>
  );
}

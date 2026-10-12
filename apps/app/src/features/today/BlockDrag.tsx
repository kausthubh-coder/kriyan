// Android: long-press a block to lift it and drag it to a new time; drag its bottom handle
// to set a length. The block follows the finger on the UI thread in 15-minute steps; React
// hears about each step (for the time label) and the drop.

import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { formatTimeRange } from "@kriyan/core/format";
import { dropHaptic, liftHaptic } from "@/features/tasks/haptics";
import { c, r, s, shadows } from "@/theme/tokens";
import { Txt } from "@/ui/Txt";
import { clampDay, STEP } from "./drag";

export interface BlockDragProps {
  top: number;
  height: number;
  left: number;
  width: number;
  start: number;
  length: number | null;
  hourPx: number;
  disabled?: boolean;
  onMove: (start: number) => void;
  onResize: (length: number) => void;
  children: ReactNode;
}

export function BlockDrag({ top, height, left, width, start, length, hourPx, disabled, onMove, onResize, children }: BlockDragProps) {
  const dy = useSharedValue(0);
  const dh = useSharedValue(0);
  const lift = useSharedValue(0);
  const stepPx = (STEP / 60) * hourPx;
  const [label, setLabel] = useState<string | null>(null);

  const show = (mode: "move" | "resize", steps: number) => {
    const dMin = steps * STEP;
    const s0 = mode === "move" ? clampDay(start + dMin, length ?? 0) : start;
    const len = mode === "resize" ? Math.max(STEP, (length ?? 0) + dMin) : length;
    setLabel(formatTimeRange(s0, len ?? undefined));
  };
  const commit = (mode: "move" | "resize", steps: number) => {
    setLabel(null);
    if (steps === 0) return;
    dropHaptic();
    if (mode === "move") onMove(clampDay(start + steps * STEP, length ?? 0));
    else onResize(Math.max(STEP, (length ?? 0) + steps * STEP));
  };

  const lastStep = useSharedValue(0);
  const move = Gesture.Pan()
    .enabled(!disabled)
    .activateAfterLongPress(350)
    .onStart(() => {
      lift.value = withTiming(1, { duration: 160 });
      lastStep.value = 0;
      scheduleOnRN(liftHaptic);
      scheduleOnRN(show, "move", 0);
    })
    .onUpdate((e) => {
      const steps = Math.round(e.translationY / stepPx);
      dy.value = steps * stepPx;
      if (steps !== lastStep.value) {
        lastStep.value = steps;
        scheduleOnRN(show, "move", steps);
      }
    })
    .onEnd(() => {
      scheduleOnRN(commit, "move", lastStep.value);
    })
    .onFinalize(() => {
      lift.value = withTiming(0, { duration: 150 });
      dy.value = 0;
    });

  const resize = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetY([-6, 6])
    .onStart(() => {
      lastStep.value = 0;
      scheduleOnRN(show, "resize", 0);
    })
    .onUpdate((e) => {
      const steps = Math.round(e.translationY / stepPx);
      dh.value = Math.max(stepPx - 2 - height, steps * stepPx);
      if (steps !== lastStep.value) {
        lastStep.value = steps;
        scheduleOnRN(show, "resize", steps);
      }
    })
    .onEnd(() => {
      scheduleOnRN(commit, "resize", lastStep.value);
    })
    .onFinalize(() => {
      dh.value = 0;
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.value }, { scale: 1 + lift.value * 0.01 }],
    height: height + dh.value,
    zIndex: lift.value > 0 || dh.value !== 0 ? 3 : 1,
  }));

  return (
    <GestureDetector gesture={move}>
      <Animated.View style={[{ position: "absolute", top, left, width, height, borderRadius: r.ctl }, style, label ? { boxShadow: shadows.overlay } : null]}>
        {children}
        {disabled ? null : (
          <GestureDetector gesture={resize}>
            <View
              accessibilityLabel="Drag to change the length"
              style={{ position: "absolute", left: 0, right: 0, bottom: -10, height: 20 }}
            />
          </GestureDetector>
        )}
        {label ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", right: s.s3, top: -30, paddingHorizontal: s.s2, paddingVertical: 2, borderRadius: r.sm, backgroundColor: c.overlay }}
          >
            <Txt variant="caption" tnum>
              {label}
            </Txt>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

// Android: long-press a task to lift it, drag it onto the timeline, let go to schedule it.
// The finger is tracked and the 15-minute slot is computed on the UI thread; React only
// hears about each new slot and the drop. The visible twin is the task's "When" field.

import type { ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { makeMutable, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { dropHaptic, liftHaptic } from "@/features/tasks/haptics";
import { dropZone, externalDrag, STEP } from "./drag";

/** The finger in window coordinates, for the ghost the Today screen draws. */
export const fingerX = makeMutable(0);
export const fingerY = makeMutable(0);
export const dragging = makeMutable(0);
/** The drop zone's window rectangle and scale, copied to the UI thread at lift. */
const zone = makeMutable({ x: 0, y: 0, w: 0, h: 0, start: 0, hourPx: 56, pad: 0, ready: false });

interface Props {
  taskId: string;
  title: string;
  color: string;
  length: number | null;
  children: ReactNode;
}

function begin(taskId: string, title: string, color: string, length: number | null) {
  liftHaptic();
  const z = dropZone();
  zone.value = { ...zone.value, ready: false };
  void z?.measure().then((r) => {
    if (r) zone.value = { x: r.x, y: r.y, w: r.width, h: r.height, start: z.startMinutes, hourPx: z.hourPx, pad: z.topPad, ready: true };
  });
  externalDrag.set({ taskId, title, color, length, x: 0, y: 0, over: null });
}

function setOver(over: number | null) {
  const drag = externalDrag.get();
  if (drag && drag.over !== over) externalDrag.set({ ...drag, over });
}

function finish(commit: boolean) {
  const drag = externalDrag.get();
  externalDrag.set(null);
  const z = dropZone();
  if (commit && drag && drag.over !== null && z) {
    dropHaptic();
    z.onDrop(drag.taskId, drag.over);
  }
}

export function DragSource({ taskId, title, color, length, children }: Props) {
  const lifted = useSharedValue(0);
  const over = useSharedValue(-1);
  const pan = Gesture.Pan()
    .activateAfterLongPress(400)
    .onStart((e) => {
      fingerX.value = e.absoluteX;
      fingerY.value = e.absoluteY;
      dragging.value = 1;
      over.value = -1;
      lifted.value = withTiming(1, { duration: 160 });
      scheduleOnRN(begin, taskId, title, color, length);
    })
    .onUpdate((e) => {
      fingerX.value = e.absoluteX;
      fingerY.value = e.absoluteY;
      const z = zone.value;
      let next = -1;
      if (z.ready && e.absoluteX >= z.x && e.absoluteX <= z.x + z.w && e.absoluteY >= z.y - 24 && e.absoluteY <= z.y + z.h + 24) {
        const minutes = z.start + ((e.absoluteY - z.y - z.pad) / z.hourPx) * 60;
        next = Math.max(0, Math.min(1440 - STEP, Math.round(minutes / STEP) * STEP));
      }
      if (next !== over.value) {
        over.value = next;
        scheduleOnRN(setOver, next < 0 ? null : next);
      }
    })
    .onEnd(() => {
      scheduleOnRN(finish, true);
    })
    .onFinalize(() => {
      dragging.value = 0;
      lifted.value = withTiming(0, { duration: 150 });
    });
  const style = useAnimatedStyle(() => ({ opacity: 1 - lifted.value * 0.5 }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}

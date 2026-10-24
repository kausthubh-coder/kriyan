// Android: long-press a task to lift it, drag it onto the timeline (or, on the phone's Today,
// onto a free stretch), let go to schedule it. Held without moving, it opens the row's menu.
// The finger is tracked and the 15-minute slot is computed on the UI thread; React only
// hears about each new slot and the drop. The visible twin is the task's "When" field.

import type { ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { makeMutable, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { dropHaptic, liftHaptic } from "@/features/tasks/haptics";
import { rowMenu } from "@/features/tasks/TaskRow";
import { dropZone, externalDrag, STEP, type SlotRect } from "./drag";

/** The finger in window coordinates, for the ghost the Today screen draws. */
const finger = { x: makeMutable(0), y: makeMutable(0), dragging: makeMutable(0) };
export const fingerX = finger.x;
export const fingerY = finger.y;
export const dragging = finger.dragging;
/** Shared values live for the app; components reach them through these, not module variables. */
const fingerShared = () => finger;
/** The drop zone's window rectangle and scale, copied to the UI thread at lift. */
const zone = makeMutable({ x: 0, y: 0, w: 0, h: 0, start: 0, hourPx: 56, pad: 0, ready: false });
/** A zone of free stretches (the phone's Today) instead of an hour grid: each one's rows. */
const zoneSlots = makeMutable<SlotRect[] | null>(null);
const slotsShared = () => zoneSlots;
const zoneShared = () => zone;

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
  zoneSlots.value = null;
  if (z?.slots) void z.slots().then((list) => (zoneSlots.value = list));
  void z?.measure().then((r) => {
    if (r)
      zone.value = {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        start: z.startMinutes,
        hourPx: z.hourPx,
        pad: z.topPad,
        ready: true,
      };
  });
  externalDrag.set({ taskId, title, color, length, x: 0, y: 0, over: null });
}

function setOver(minutes: number | null) {
  const drag = externalDrag.get();
  if (drag && (drag.over?.minutes ?? null) !== minutes)
    externalDrag.set({ ...drag, over: minutes === null ? null : { minutes } });
}

/** Held without moving: the row's menu instead of a drag. */
function hold(taskId: string) {
  externalDrag.set(null);
  rowMenu.set(taskId);
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
  const f = fingerShared();
  const z0 = zoneShared();
  const sl0 = slotsShared();
  const lifted = useSharedValue(0);
  const over = useSharedValue(-1);
  const pan = Gesture.Pan()
    .activateAfterLongPress(400)
    .onStart((e) => {
      f.x.value = e.absoluteX;
      f.y.value = e.absoluteY;
      f.dragging.value = 1;
      over.value = -1;
      lifted.value = withTiming(1, { duration: 160 });
      scheduleOnRN(begin, taskId, title, color, length);
    })
    .onUpdate((e) => {
      f.x.value = e.absoluteX;
      f.y.value = e.absoluteY;
      const z = z0.value;
      const list = sl0.value;
      let next = -1;
      if (list) {
        for (const sl of list) {
          if (e.absoluteY >= sl.y - 8 && e.absoluteY <= sl.y + sl.height + 8) next = sl.minutes;
        }
      } else if (
        z.ready &&
        e.absoluteX >= z.x &&
        e.absoluteX <= z.x + z.w &&
        e.absoluteY >= z.y - 24 &&
        e.absoluteY <= z.y + z.h + 24
      ) {
        const minutes = z.start + ((e.absoluteY - z.y - z.pad) / z.hourPx) * 60;
        next = Math.max(0, Math.min(1440 - STEP, Math.round(minutes / STEP) * STEP));
      }
      if (next !== over.value) {
        over.value = next;
        scheduleOnRN(setOver, next < 0 ? null : next);
      }
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) < 8 && Math.abs(e.translationY) < 8) scheduleOnRN(hold, taskId);
      else scheduleOnRN(finish, true);
    })
    .onFinalize(() => {
      f.dragging.value = 0;
      lifted.value = withTiming(0, { duration: 150 });
    });
  const style = useAnimatedStyle(() => ({ opacity: 1 - lifted.value * 0.5 }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}

// Haptics on Android at commit moments only: a task ticked, dropped on the timeline, a
// habit checked. Never on touch-down, never per frame. Off when the person turned Haptics off
// in Settings.

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { hapticsOn } from "@/features/feel/setting";

export function commitHaptic() {
  if (Platform.OS !== "android" || !hapticsOn()) return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => undefined);
}

/** A task lifts off the list to be dragged. */
export function liftHaptic() {
  if (Platform.OS !== "android" || !hapticsOn()) return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Drag_Start).catch(() => undefined);
}

/** A light tap when a dragged task lands on the timeline. */
export function dropHaptic() {
  if (Platform.OS !== "android" || !hapticsOn()) return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Gesture_End).catch(() => undefined);
}

export function toggleHaptic(on: boolean) {
  if (Platform.OS !== "android" || !hapticsOn()) return;
  void Haptics.performAndroidHapticsAsync(
    on ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off,
  ).catch(() => undefined);
}

/** A swipe crosses the line where letting go will act. */
export function armHaptic() {
  if (Platform.OS !== "android" || !hapticsOn()) return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick).catch(() => undefined);
}

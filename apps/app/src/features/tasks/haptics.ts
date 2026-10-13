// Haptics on Android at commit moments only: a task ticked, dropped on the timeline, a
// habit checked. Never on touch-down, never per frame.

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function commitHaptic() {
  if (Platform.OS !== "android") return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => undefined);
}

/** A task lifts off the list to be dragged. */
export function liftHaptic() {
  if (Platform.OS !== "android") return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Drag_Start).catch(() => undefined);
}

/** A light tap when a dragged task lands on the timeline. */
export function dropHaptic() {
  if (Platform.OS !== "android") return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Gesture_End).catch(() => undefined);
}

export function toggleHaptic(on: boolean) {
  if (Platform.OS !== "android") return;
  void Haptics.performAndroidHapticsAsync(
    on ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off,
  ).catch(() => undefined);
}

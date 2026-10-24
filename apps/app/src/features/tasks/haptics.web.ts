// Haptics in a phone's browser (haptics.ts is the Android app's): the same commit moments, as
// short vibrations with B2's timings (b2.html `HAPTIC`). Only on touch phones whose browser can
// vibrate, and only while Haptics is on in Settings; everywhere else these do nothing.

import { hapticsOn } from "@/features/feel/setting";
import { canVibrate } from "@/features/feel/vibrate";

function vibrate(pattern: number | number[]) {
  if (!hapticsOn() || !canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // A browser that refuses (no user gesture yet) just stays still.
  }
}

export function commitHaptic() {
  vibrate([12, 40, 18]);
}

/** A task lifts off the list to be dragged. */
export function liftHaptic() {
  vibrate(10);
}

/** A light tap when a dragged task lands on the timeline. */
export function dropHaptic() {
  vibrate(10);
}

export function toggleHaptic(on: boolean) {
  vibrate(on ? 10 : 6);
}

/** A swipe crosses the line where letting go will act. */
export function armHaptic() {
  vibrate(6);
}

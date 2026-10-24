// The last day the person closed in Review. Today's "Review today" card goes away once that
// day is closed. Kept on the device (the web's localStorage; memory on Android), since closing
// the day is a moment on this screen, not something agents need to read.

import { createStore } from "@/data/store";

const KEY = "kriyan.closedDay";

function stored(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const closedDay = createStore<string | null>(stored());

export function closeDayOnDevice(date: string) {
  closedDay.set(date);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, date);
  } catch {
    // Private browsing can refuse storage; the card still goes for this visit.
  }
}

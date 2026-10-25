// How Today shows the day (Settings' "Today shows"), behind one adapter.
// Design v5 contract A puts todayLayout, earlierWindow, showSpace and hideDone on the profile
// (todayView.profile returns them, account.updateProfile takes them). Until that lands they're
// kept on this device, so the switches work and Today can read them already; wiring them to the
// profile changes only `useTodayPrefs` and `saveTodayPrefs` below.
// "Now" on what's happening isn't in the contract: it stays a device setting.

import { createStore } from "@/data/store";
import { readLocal, writeLocal } from "@/features/feel/storage";

export type TodayLayout = "blocks" | "list";
export type EarlierWindow = "none" | "week" | "month" | "all";

export interface TodayPrefs {
  todayLayout: TodayLayout;
  earlierWindow: EarlierWindow;
  showSpace: boolean;
  hideDone: boolean;
  /** The red "● Now" on what's happening; on this device only. */
  nowBadge: boolean;
}

export const DEFAULT_TODAY_PREFS: TodayPrefs = {
  todayLayout: "blocks",
  earlierWindow: "week",
  showSpace: true,
  hideDone: false,
  nowBadge: true,
};

const KEY = "kriyan.todayPrefs";

function load(): TodayPrefs {
  const raw = readLocal(KEY);
  if (!raw) return DEFAULT_TODAY_PREFS;
  try {
    const saved = JSON.parse(raw) as Partial<TodayPrefs>;
    return { ...DEFAULT_TODAY_PREFS, ...saved };
  } catch {
    return DEFAULT_TODAY_PREFS;
  }
}

const prefs = createStore<TodayPrefs>(load());

export function useTodayPrefs(): TodayPrefs {
  return prefs.useValue((p) => p);
}

export function saveTodayPrefs(patch: Partial<TodayPrefs>) {
  prefs.set((prev) => ({ ...prev, ...patch }));
  writeLocal(KEY, JSON.stringify(prefs.get()));
}

// What a new person builds before signing in (onboarding.html steps 1 to 6): their day's hours
// and a first task. It lives on this device until sign-in saves it to the account, so a Google
// redirect or a closed tab doesn't lose it.

import { Platform } from "react-native";
import type { CivilDate } from "@kriyan/core/dates";
import { createStore } from "@/data/store";
import { readLocal, writeLocal } from "@/features/feel/storage";

export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Help = "days" | "uni" | "habits" | "focus" | "goal" | "ai";

export interface Draft {
  step: Step;
  /** What Kriyan should help with. Kept on the device only: nothing reads it yet. */
  helps: Help[];
  /** Minutes after midnight. Wind down can be midnight itself (1440). */
  wake: number;
  wind: number;
  /** Hours of classes or work on a weekday, for the free-time sum. */
  fixed: number;
  /** True once the person answered the hours step, so only answers they gave are saved. */
  hours: boolean;
  /** The first task as typed, and the day it was typed (a task with no date lands there). */
  task: { text: string; date: CivilDate } | null;
  /** The draft reached the account, or the account was already set up and kept as it was. */
  saved: boolean;
}

const KEY = "kriyan.onboarding";
const SIGNED_IN_HERE = "kriyan.signedInHere";

const FRESH: Draft = {
  step: 1,
  helps: ["days", "uni"],
  wake: 7 * 60,
  wind: 22 * 60 + 30,
  fixed: 6,
  hours: false,
  task: null,
  saved: false,
};

function load(): Draft {
  const raw = readLocal(KEY);
  if (!raw) return FRESH;
  try {
    return { ...FRESH, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    return FRESH;
  }
}

export const draft = createStore<Draft>(load());

export function updateDraft(patch: Partial<Draft>) {
  draft.set((prev) => ({ ...prev, ...patch }));
  writeLocal(KEY, JSON.stringify(draft.get()));
}

/** Onboarding is over (Open Today, or a card that leaves it): the next sign-out starts at sign-in. */
export function finishDraft() {
  writeLocal(KEY, null);
  draft.set(FRESH);
}

/** Whether onboarding is under way on this device (a step past the welcome, not yet finished). */
export function inProgress(): boolean {
  return readLocal(KEY) !== null && draft.get().step > 1;
}

/** Someone has signed in on this device before: signed out, it opens on sign-in, not onboarding. */
export function signedInHere(): boolean {
  return readLocal(SIGNED_IN_HERE) === "1";
}

export function rememberSignedInHere() {
  if (!signedInHere()) writeLocal(SIGNED_IN_HERE, "1");
}

export type Surface = "android" | "iphone" | "web";

/** Where onboarding runs: the Android app, Safari on an iPhone, or any other browser. */
export function surface(): Surface {
  if (Platform.OS !== "web") return "android";
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) ? "iphone" : "web";
}

/** Opened from the Home Screen rather than in Safari's tab. */
export function standalone(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Whether this person gets step 7 after signing in: Add to Home Screen on an iPhone in Safari,
 * reminders in the Android app, and reminders through Web Push in a browser that has it (an
 * iPhone once opened from the Home Screen). `webReminders` is useWebReminders().available:
 * while it loads the step counts, so a browser that can't is moved on from step 7 itself.
 */
export function hasStep7(webReminders: boolean | undefined): boolean {
  const where = surface();
  if (where === "android") return true;
  if (where === "iphone" && !standalone()) return true;
  return webReminders !== false;
}

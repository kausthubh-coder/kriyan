// Goals and habits' v5 data behind one adapter, so the screen doesn't change when the backend
// does. Design v5 contract A adds to GoalView `entries` (the last 12 logged values) and `feeds`
// (the habits and tasks that feed it), a `goals.log({ goalId, value })` mutation that sets the
// value and appends an entry, and routines. Until it lands: no trend line, no "Fed by", the
// quick log buttons set the goal's value with updateGoal, and there are no routines. Wiring it
// is a change here only.

import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import type { ProgressView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { showToast } from "@/ui/toast";

export type Goal = ProgressView["goals"][number];
export type Habit = ProgressView["habits"][number];

/** Contract A's GoalView additions. */
export interface GoalEntry {
  date: string;
  value: number;
}
export interface GoalFeeds {
  habits: string[];
  tasks: number;
}
type V5Goal = Goal & Partial<{ entries: GoalEntry[]; feeds: GoalFeeds }>;

/** The goal's logged values, oldest first; empty until contract A lands. */
export function goalEntries(goal: Goal): GoalEntry[] {
  return (goal as V5Goal).entries ?? [];
}

/** What feeds the goal ("Fed by Gym"); nothing until contract A lands. */
export function goalFeeds(goal: Goal): GoalFeeds {
  return (goal as V5Goal).feeds ?? { habits: [], tasks: 0 };
}

/** Moves a number goal's value by `delta` (+$20, −0.5 kg). */
export function useLogGoal() {
  const update = useMutation(api.organize.updateGoal);
  return (goal: Goal, delta: number) => {
    const value = Math.max(0, Math.round((goal.current + delta) * 100) / 100);
    return update({ id: goal._id, current: value }).catch((e: unknown) => showToast(errorText(e)));
  };
}

/** Contract A's routine as Goals and habits lists it (todayView.routines). */
export interface Routine {
  _id: string;
  title: string;
  color: string | null;
  time: number;
  length: number;
  parts: { index: number; title: string; length: number | null; habitId: string | null; done: boolean }[];
  streak: number;
  done: boolean;
}

/** The person's routines; none until contract A lands. */
export function useRoutines(): Routine[] {
  return [];
}

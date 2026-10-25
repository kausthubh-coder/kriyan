// Goals and habits' data shapes: goal views carry their last entries (the trend line) and what
// feeds them; goals.log sets a number goal's value and adds an entry; routines come with Today.

import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import { useTodayView, type ProgressView, type TodayView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { showToast } from "@/ui/toast";

export type Goal = ProgressView["goals"][number];
export type Habit = ProgressView["habits"][number];
export type Routine = TodayView["routines"][number];

/** Moves a number goal's value by `delta` (+$20, 0.5 kg lost) and logs it. */
export function useLogGoal() {
  const log = useMutation(api.goals.log);
  return (goal: Goal, delta: number) => {
    const value = Math.max(0, Math.round((goal.current + delta) * 100) / 100);
    return log({ goalId: goal._id, value }).catch((e: unknown) => showToast(errorText(e)));
  };
}

/** Today's routines (only the parts that run today). */
export function useRoutines(): Routine[] {
  return useTodayView()?.routines ?? [];
}

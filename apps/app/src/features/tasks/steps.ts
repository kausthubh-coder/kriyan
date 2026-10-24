// Steps: the short checklist inside a task (tasks.steps). The task sheet and Focus both edit
// it, and a tick shows at once: the saved list is written into the task's query before the
// server answers.

import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import type { TaskDoc } from "@/data/views";
import { showToast } from "@/ui/toast";
import { errorText } from "./actions";

export type Step = NonNullable<TaskDoc["steps"]>[number];

/** A step's title can be up to this long (the server's limit). */
export const STEP_MAX = 200;

/** "2 of 5 steps", or null when the task has none. */
export function stepsText(steps: readonly Step[] | undefined): string | null {
  if (!steps?.length) return null;
  return `${steps.filter((st) => st.done).length} of ${steps.length} steps`;
}

/** The first step not ticked off yet, with its place in the list. */
export function nextStep(steps: readonly Step[] | undefined): { index: number; step: Step } | null {
  const index = steps?.findIndex((st) => !st.done) ?? -1;
  const step = index >= 0 ? steps?.[index] : undefined;
  return step ? { index, step } : null;
}

/** Saves a task's whole list of steps; an empty list clears it. */
export function useSaveSteps(id: Id<"tasks">) {
  const update = useMutation(api.tasks.update).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.views.task, { id });
    if (!current || args.steps === undefined) return;
    store.setQuery(api.views.task, { id }, { ...current, steps: args.steps ?? undefined });
  });
  return (steps: Step[]) =>
    void update({ id, steps: steps.length ? steps : null }).catch((e: unknown) => showToast(errorText(e)));
}

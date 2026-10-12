// What happens when a person ticks, deletes or moves a task. Undo instead of asking.
// These run outside components (the command menu and shortcuts call them too).

import type { FunctionReturnType } from "convex/server";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { convex } from "@/data/convex";
import { createStore } from "@/data/store";
import { showToast } from "@/ui/toast";
import { commitHaptic } from "./haptics";

type Completion = FunctionReturnType<typeof api.tasks.complete>;

/** Rows ticked a moment ago: they show as done and stay in place until the server catches up. */
export const ticking = createStore<Record<string, true>>({});

/** How long a ticked row stays where it was before it moves to Done. */
const LINGER_MS = 900;

function setTicking(id: string, on: boolean) {
  ticking.set((prev) => {
    const next = { ...prev };
    if (on) next[id] = true;
    else delete next[id];
    return next;
  });
}

export function errorText(error: unknown): string {
  const data = (error as { data?: unknown }).data;
  if (typeof data === "string") return data;
  return "That didn't save. Check your connection and try again.";
}

export function completeTask(task: { _id: Id<"tasks">; title: string }) {
  const id = task._id;
  setTicking(id, true);
  commitHaptic();
  let completion: Completion | null = null;
  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled) return;
    convex
      .mutation(api.tasks.complete, { id })
      .then((result) => {
        completion = result;
      })
      .catch((error: unknown) => {
        showToast(errorText(error));
      })
      .finally(() => setTicking(id, false));
  }, LINGER_MS);
  showToast(`Done: ${task.title}`, {
    label: "Undo",
    run: () => {
      if (!completion) {
        cancelled = true;
        clearTimeout(timer);
        setTicking(id, false);
        return;
      }
      void convex.mutation(api.tasks.undoComplete, { id, completion }).catch((e: unknown) => showToast(errorText(e)));
    },
  });
}

export function reopenTask(id: Id<"tasks">) {
  void convex.mutation(api.tasks.reopen, { id }).catch((e: unknown) => showToast(errorText(e)));
}

export function deleteTask(task: { _id: Id<"tasks">; title: string }, after?: () => void) {
  void convex
    .mutation(api.tasks.remove, { id: task._id })
    .then(() => {
      after?.();
      showToast(`Deleted: ${task.title}`, {
        label: "Undo",
        run: () => void convex.mutation(api.tasks.restore, { id: task._id }),
      });
    })
    .catch((e: unknown) => showToast(errorText(e)));
}

/** Moves tasks to a day, optionally a time. `null` sends them back to no date. */
export function moveTasks(ids: Id<"tasks">[], date: string | null, time?: number | null) {
  return convex
    .mutation(api.tasks.move, { ids, date, ...(time !== undefined ? { time } : {}) })
    .catch((e: unknown) => showToast(errorText(e)));
}

export function updateTask(args: FunctionArgs<typeof api.tasks.update>) {
  return convex.mutation(api.tasks.update, args).catch((e: unknown) => {
    showToast(errorText(e));
  });
}

type FunctionArgs<F> = F extends { _args: infer A } ? A : never;

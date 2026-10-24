// What happens when a person ticks, deletes or moves a task. Undo instead of asking.
// These run outside components (the command menu and shortcuts call them too).

import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { convex } from "@/data/convex";
import { createStore } from "@/data/store";
import { formatDay } from "@kriyan/core/format";
import { todayIn } from "@kriyan/core/dates";
import { deviceTimeZone } from "@/data/time";
import { playSound } from "@/features/feel/sound";
import { showToast, updateToast } from "@/ui/toast";
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

/**
 * Ticks a task off. `date` is the date its row shows, so the server can refuse a stale tick
 * (a projected repeat, or one that already moved on) instead of ticking the wrong occurrence.
 * Events are attended, not ticked.
 */
export function completeTask(task: {
  _id: Id<"tasks">;
  title: string;
  date?: string | null;
  event?: boolean;
}) {
  const id = task._id;
  if (task.event || ticking.get()[id]) return;
  setTicking(id, true);
  commitHaptic();
  playSound("done");
  let completion: Completion | null = null;
  let sent = false;
  let undoAsked = false;
  const undo = (done: Completion) =>
    void convex
      .mutation(api.tasks.undoComplete, { id, completion: done })
      .catch((e: unknown) => showToast(errorText(e)));
  const timer = setTimeout(() => {
    sent = true;
    convex
      .mutation(api.tasks.complete, { id, date: task.date ?? null })
      .then((result) => {
        completion = result;
        // Undo was pressed while the tick was on its way: take it back now that it landed.
        if (undoAsked) return undo(result);
        if (result.next)
          updateToast(
            toast,
            `Done: ${task.title}. Next: ${formatDay(result.next, todayIn(deviceTimeZone()))}`,
          );
      })
      .catch((error: unknown) => {
        showToast(errorText(error));
      })
      .finally(() => setTicking(id, false));
  }, LINGER_MS);
  const toast = showToast(`Done: ${task.title}`, {
    label: "Undo",
    run: () => {
      if (completion) return undo(completion);
      if (sent) {
        undoAsked = true;
        return;
      }
      clearTimeout(timer);
      setTicking(id, false);
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

/** Brings a deleted task back where it was, from Recently deleted. */
export function restoreTask(task: { _id: Id<"tasks">; title: string }) {
  void convex
    .mutation(api.tasks.restore, { id: task._id })
    .then(() => showToast(`Restored: ${task.title}`))
    .catch((e: unknown) => showToast(errorText(e)));
}

/** Skips one occurrence of a repeating task (it moves to its next date), and offers Undo. */
export function skipTask(task: { _id: Id<"tasks">; title: string; time: number | null }) {
  commitHaptic();
  playSound("swoosh");
  return convex
    .mutation(api.tasks.skip, { id: task._id })
    .then(({ date, next }) => {
      const where = next ? formatDay(next, todayIn(deviceTimeZone())) : "Recently deleted";
      showToast(`Skipped: ${task.title}. Next: ${where}`, {
        label: "Undo",
        run: () =>
          void (next
            ? convex.mutation(api.tasks.move, { ids: [task._id], date, time: task.time })
            : convex.mutation(api.tasks.restore, { id: task._id })),
      });
    })
    .catch((e: unknown) => showToast(errorText(e)));
}

/** Where a task sits now, so a move can be undone. */
export interface Placement {
  _id: Id<"tasks">;
  title: string;
  date: string | null;
  time: number | null;
}

/** Gives tasks a time on the day they're on (a drag on the timeline). The block itself shows it. */
export function placeTasks(ids: Id<"tasks">[], date: string | null, time?: number | null) {
  playSound("tick");
  return convex
    .mutation(api.tasks.move, { ids, date, ...(time !== undefined ? { time } : {}) })
    .catch((e: unknown) => showToast(errorText(e)));
}

/** Moves tasks to another day (`null`: back to no date), and offers Undo. */
export function moveTasks(tasks: Placement[], date: string | null, time?: number | null) {
  if (!tasks.length) return Promise.resolve();
  commitHaptic();
  playSound("swoosh");
  const where = date ? formatDay(date, todayIn(deviceTimeZone())) : "no date";
  const [only] = tasks;
  const text =
    tasks.length === 1 && only ? `Moved to ${where}: ${only.title}` : `Moved ${tasks.length} to ${where}`;
  return convex
    .mutation(api.tasks.move, { ids: tasks.map((t) => t._id), date, ...(time !== undefined ? { time } : {}) })
    .then(() => {
      showToast(text, { label: "Undo", run: () => void undoMove(tasks) });
    })
    .catch((e: unknown) => showToast(errorText(e)));
}

/** Moves what's still open today to tomorrow, and offers Undo. */
export function closeDay(today: string) {
  commitHaptic();
  playSound("swoosh");
  return convex
    .mutation(api.tasks.closeDay, { today })
    .then((moved) => {
      if (!moved.length) showToast("Nothing left to move");
      else
        showToast(`Moved ${moved.length} to Tomorrow`, {
          label: "Undo",
          run: () => void undoMove(moved),
        });
    })
    .catch((e: unknown) => showToast(errorText(e)));
}

/** Puts each task back on its own day and time; tasks that shared a place move back together. */
async function undoMove(tasks: Placement[]) {
  const groups = new Map<string, Placement[]>();
  for (const t of tasks) {
    const key = `${t.date}|${t.time}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  try {
    await Promise.all(
      [...groups.values()].map((group) => {
        const [{ date, time }] = group as [Placement];
        return convex.mutation(api.tasks.move, { ids: group.map((t) => t._id), date, time });
      }),
    );
  } catch (e) {
    showToast(errorText(e));
  }
}

export function updateTask(args: FunctionArgs<typeof api.tasks.update>) {
  return convex.mutation(api.tasks.update, args).catch((e: unknown) => {
    showToast(errorText(e));
  });
}

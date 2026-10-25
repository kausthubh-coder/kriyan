// Where Today's buttons go, and the routine actions.
//
// /menu and /goals are slice B's routes (the shell redesign); typed routes only know them once
// B lands, so they're named here once.

import type { Href } from "expo-router";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@kriyan/convex/api";
import { convex } from "@/data/convex";
import { errorText } from "@/features/tasks/actions";
import { commitHaptic } from "@/features/tasks/haptics";
import { playSound } from "@/features/feel/sound";
import { showToast } from "@/ui/toast";
import type { RoutineView } from "./model";

export const MENU_ROUTE = "/menu" as Href;
export const GOALS_ROUTE = "/goals" as Href;
export const SETTINGS_ROUTE: Href = "/settings";

/** Shows the ticks at once in the day's view; the server's answer replaces them. */
function tickLocally(
  store: OptimisticLocalStore,
  routineId: string,
  date: string,
  done: (index: number) => boolean | null,
) {
  const view = store.getQuery(api.views.today, { today: date });
  if (!view) return;
  store.setQuery(
    api.views.today,
    { today: date },
    {
      ...view,
      routines: view.routines.map((r) => {
        if (r._id !== routineId) return r;
        const parts = r.parts.map((p) => ({ ...p, done: done(p.index) ?? p.done }));
        return { ...r, parts, done: parts.every((p) => p.done) };
      }),
    },
  );
}

export function tickRoutinePart(routine: RoutineView, index: number, date: string, done: boolean) {
  commitHaptic();
  if (done) playSound("tick");
  const finishes = done && routine.parts.every((p) => p.index === index || p.done);
  return convex
    .mutation(
      api.routines.tickPart,
      { routineId: routine._id, index, date, done },
      {
        optimisticUpdate: (store) =>
          tickLocally(store, routine._id, date, (i) => (i === index ? done : null)),
      },
    )
    .then(() => {
      if (finishes) showToast(`${routine.title} done, ${routine.streak + 1} days in a row`);
    })
    .catch((e: unknown) => showToast(errorText(e)));
}

export function tickRoutineAll(routine: RoutineView, date: string, done: boolean) {
  commitHaptic();
  if (done) playSound("done");
  const before = routine.parts.filter((p) => p.done).map((p) => p.index);
  return convex
    .mutation(
      api.routines.tickAll,
      { routineId: routine._id, date, done },
      { optimisticUpdate: (store) => tickLocally(store, routine._id, date, () => done) },
    )
    .then(() =>
      showToast(done ? `${routine.title}, all done` : `${routine.title}, unticked`, {
        label: "Undo",
        run: () =>
          void Promise.all(
            routine.parts.map((p) =>
              convex.mutation(api.routines.tickPart, {
                routineId: routine._id,
                index: p.index,
                date,
                done: before.includes(p.index),
              }),
            ),
          ).catch((e: unknown) => showToast(errorText(e))),
      }),
    )
    .catch((e: unknown) => showToast(errorText(e)));
}

export function removeRoutine(routine: RoutineView) {
  return convex
    .mutation(api.routines.remove, { routineId: routine._id })
    .then(() => showToast(`Removed ${routine.title}`))
    .catch((e: unknown) => showToast(errorText(e)));
}

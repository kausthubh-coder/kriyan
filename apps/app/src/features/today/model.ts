// What Today reads, in one place: the day's view (tasks, routines, habits, the Today settings)
// turned into the items core's rules take.

import type { DayItem } from "@kriyan/core/today";
import type { TaskView, TodayView } from "@/data/views";

export type RoutineView = TodayView["routines"][number];
export type HabitView = TodayView["habits"][number];
export type PrepFor = NonNullable<TaskView["prepFor"]>;
export type TodaySettings = Pick<
  TodayView["profile"],
  "todayLayout" | "earlierWindow" | "showSpace" | "hideDone"
>;

export function routinesOf(view: TodayView): RoutineView[] {
  return view.routines;
}

export function settingsOf(view: TodayView): TodaySettings {
  return view.profile;
}

export function prepForOf(task: Pick<TaskView, "prepFor">): PrepFor | null {
  return task.prepFor ?? null;
}

/** Habits inside a routine are left out of the view already; they show in the routine. */
export function standaloneHabits(view: TodayView): HabitView[] {
  return view.habits;
}

/** A space's name from its path ("School / CSC 316" is "CSC 316"). */
export function spaceName(path: string | null): string | null {
  return path ? (path.split(" / ").at(-1) ?? path) : null;
}

export function taskItem(t: TaskView): DayItem {
  return {
    id: t._id,
    title: t.title,
    kind: t.event ? "event" : "task",
    time: t.time,
    length: t.length,
    spaceId: t.spaceId,
    spaceName: spaceName(t.spacePath),
    color: t.color,
    done: t.done,
    proposed: t.proposedBy !== null,
    yearly: t.repeat?.freq === "year",
    date: t.date,
    deadline: t.deadline,
    dueTime: t.dueTime,
  };
}

export function routineItem(r: RoutineView, spaces: TodayView["spaces"]): DayItem {
  const sp = spaces.find((s) => s._id === r.spaceId);
  return {
    id: r._id,
    title: r.title,
    kind: "routine",
    time: r.time,
    length: r.length,
    spaceId: r.spaceId,
    spaceName: sp?.name ?? null,
    color: r.color,
    done: r.done,
    proposed: false,
    yearly: false,
    date: null,
    deadline: null,
    dueTime: null,
  };
}

export function habitItem(h: HabitView, spaces: TodayView["spaces"], day: string): DayItem {
  return {
    id: h._id,
    title: h.title,
    kind: "habit",
    time: null,
    length: null,
    spaceId: null,
    spaceName: null,
    color: h.color,
    done: h.doneToday,
    proposed: false,
    yearly: false,
    date: day,
    deadline: null,
    dueTime: null,
  };
}

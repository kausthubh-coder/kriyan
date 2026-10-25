// What Today reads, in one place: the day's view turned into the items core's rules take, plus
// the fields contract A adds (routines, prepFor, the Today settings, earlier[].ageDays). Until
// those land the view simply lacks them, so each is read through a widened type with the
// contract's shape and a default; wiring A means replacing these readers with plain fields.

import type { SpaceColor } from "@kriyan/core/tokens";
import { ageDays, type DayItem, type EarlierWindow } from "@kriyan/core/today";
import type { TaskView, TodayView } from "@/data/views";

/** Contract A: `todayView.routines[]`. */
export interface RoutineView {
  _id: string;
  title: string;
  color: SpaceColor | null;
  spaceId: string | null;
  /** Minutes after midnight. */
  time: number;
  /** Today's parts summed. */
  length: number;
  parts: { index: number; title: string; length: number | null; habitId: string | null; done: boolean }[];
  streak: number;
  done: boolean;
}

/** Contract A: `TaskView.prepFor`, the test a study session prepares for. */
export interface PrepFor {
  title: string;
  date: string;
  daysLeft: number;
}

/** Contract A: the Today settings on `todayView.profile`. */
export interface TodaySettings {
  todayLayout: "blocks" | "list";
  earlierWindow: EarlierWindow;
  showSpace: boolean;
  hideDone: boolean;
}

export type HabitView = TodayView["habits"][number] & { routineId?: string | null; goalId?: string | null };

type Widened = TodayView & {
  routines?: RoutineView[];
  profile: TodayView["profile"] & Partial<TodaySettings>;
};

export function routinesOf(view: TodayView): RoutineView[] {
  return (view as Widened).routines ?? devRoutines();
}

export function settingsOf(view: TodayView): TodaySettings {
  const p = (view as Widened).profile;
  return {
    todayLayout: devLayout() ?? p.todayLayout ?? "blocks",
    earlierWindow: p.earlierWindow ?? "week",
    showSpace: p.showSpace ?? true,
    hideDone: p.hideDone ?? false,
  };
}

export function prepForOf(task: TaskView): PrepFor | null {
  return (task as TaskView & { prepFor?: PrepFor | null }).prepFor ?? null;
}

/** Habits that are a routine's part show inside the routine, not on their own. */
export function standaloneHabits(view: TodayView): HabitView[] {
  return (view.habits as HabitView[]).filter((h) => !h.routineId);
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

/** Contract A gives each earlier item `ageDays`; until then it's counted from its day or due date. */
export function earlierAge(t: TaskView, today: string): number {
  return (t as TaskView & { ageDays?: number }).ageDays ?? ageDays(t, today);
}

// ---- dev fixtures, only in development builds, to see contract A's pieces before it lands ----
// `?fixture=routines` adds a morning and a night routine; `?layout=list` shows the list layout.

function devParam(name: string): string | null {
  if (!__DEV__ || typeof window === "undefined" || !window.location?.search) return null;
  return new URLSearchParams(window.location.search).get(name);
}

function devLayout(): "blocks" | "list" | null {
  const v = devParam("layout");
  return v === "list" || v === "blocks" ? v : null;
}

let fixture: RoutineView[] | null = null;
function devRoutines(): RoutineView[] {
  if (devParam("fixture") !== "routines") return [];
  fixture ??= [
    {
      _id: "fixture-morning",
      title: "Morning routine",
      color: "pink",
      spaceId: null,
      time: 7 * 60,
      length: 75,
      parts: [
        { index: 0, title: "Brush teeth", length: 5, habitId: null, done: true },
        { index: 1, title: "Meditate", length: 10, habitId: "fixture-habit", done: true },
        { index: 2, title: "Gym", length: 45, habitId: "fixture-gym", done: false },
        { index: 3, title: "Cold plunge", length: 5, habitId: null, done: false },
        { index: 4, title: "Shower", length: 10, habitId: null, done: false },
      ],
      streak: 18,
      done: false,
    },
    {
      _id: "fixture-night",
      title: "Night routine",
      color: "purple",
      spaceId: null,
      time: 22 * 60,
      length: 20,
      parts: [
        { index: 0, title: "Read", length: 15, habitId: null, done: false },
        { index: 1, title: "Plan tomorrow", length: 5, habitId: null, done: false },
      ],
      streak: 4,
      done: false,
    },
  ];
  return fixture;
}

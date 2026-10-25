// One day as Today draws it: the day's view read through the adapter, turned into core's items,
// and run through core's rules (the time blocks, To fit in, the sentence).

import { useMemo } from "react";
import { addDays } from "@kriyan/core/dates";
import {
  daySentence,
  dueDuring,
  fitIn,
  isSpaceBlock,
  timeline,
  type DayItem,
  type FitChip,
  type SentencePart,
  type TimelineEntry,
} from "@kriyan/core/today";
import { useClock } from "@/data/time";
import { useDayView, useProfile, type TaskView, type TodayView } from "@/data/views";
import { closedDay } from "@/features/review/closedDay";
import {
  habitItem,
  prepForOf,
  routineItem,
  routinesOf,
  settingsOf,
  standaloneHabits,
  taskItem,
  type HabitView,
  type RoutineView,
  type TodaySettings,
} from "./model";

/** "Review today" sits here when the person hasn't picked a time (Settings). */
export const DEFAULT_REVIEW = 20 * 60;

/** What an item on the day came from, so a tap opens the right sheet. */
export type Source =
  | { type: "task"; task: TaskView }
  | { type: "routine"; routine: RoutineView }
  | { type: "habit"; habit: HabitView };

export interface Day {
  view: TodayView;
  day: string;
  isToday: boolean;
  /** Minutes after midnight on today; null on other days. */
  now: number | null;
  settings: TodaySettings;
  dayStart: number;
  dayEnd: number;
  reviewTime: number | null;
  closed: boolean;
  sources: Map<string, Source>;
  entries: TimelineEntry[];
  chips: FitChip[];
  /** Yearly dates (birthdays) at the top. */
  birthdays: TaskView[];
  habits: HabitView[];
  habitItems: DayItem[];
  /** Tasks due during a class, by the class's id. */
  inClass: Map<string, TaskView[]>;
  /** Timed items (tasks and routines) in time order. */
  timed: DayItem[];
  /** Planned that day with no time, done or not. */
  untimed: DayItem[];
  due: DayItem[];
  earlier: DayItem[];
  sentence: SentencePart[];
  /** Everything with a time, for nextGap. */
  busy: DayItem[];
}

export function useDay(day: string): Day | undefined {
  const view = useDayView(day);
  const profile = useProfile();
  const { today, now } = useClock();
  const closedOn = closedDay.useValue((d) => d);
  return useMemo(
    () =>
      view ? compose(view, day, today, now, profile?.reviewTime ?? DEFAULT_REVIEW, closedOn) : undefined,
    [view, day, today, now, profile?.reviewTime, closedOn],
  );
}

function compose(
  view: TodayView,
  day: string,
  today: string,
  clock: number,
  review: number,
  closedOn: string | null,
): Day {
  const isToday = day === today;
  const now = isToday ? clock : null;
  const settings = settingsOf(view);
  const sources = new Map<string, Source>();
  const keep = (i: DayItem) => !settings.hideDone || !i.done;

  const tasks = [...view.scheduled, ...view.anytime, ...view.done];
  for (const t of [...tasks, ...view.due, ...view.earlier]) sources.set(t._id, { type: "task", task: t });
  const routines = routinesOf(view);
  for (const r of routines) sources.set(r._id, { type: "routine", routine: r });
  const habits = standaloneHabits(view);
  for (const h of habits) sources.set(h._id, { type: "habit", habit: h });

  const timed = [...view.scheduled.map(taskItem), ...routines.map((r) => routineItem(r, view.spaces))]
    .filter(keep)
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  const untimedTasks = [...view.anytime, ...view.done];
  const birthdays = untimedTasks.filter((t) => t.repeat?.freq === "year");
  const untimed = untimedTasks
    .filter((t) => t.repeat?.freq !== "year")
    .map(taskItem)
    .filter(keep);
  const due = isToday || day > today ? view.due.map(taskItem) : [];
  const earlier = isToday ? view.earlier.map(taskItem) : [];
  const events = timed.filter((i) => i.kind === "event");

  const closed = closedOn === day;
  const reviewTime = day < today ? null : review;
  const entries = timeline({
    items: timed,
    dayStart: view.profile.dayStart,
    dayEnd: view.profile.dayEnd,
    reviewTime,
    now,
  });
  const chips = fitIn({
    day,
    isToday,
    due,
    untimed,
    earlier,
    events,
    window: settings.earlierWindow,
  });

  // A task due during a class shows inside the class block, wherever it was planned.
  const inClass = new Map<string, TaskView[]>();
  for (const t of [...view.due, ...view.anytime, ...view.scheduled]) {
    const klass = dueDuring(taskItem(t), events, day);
    if (!klass || t.event) continue;
    inClass.set(klass.id, [...(inClass.get(klass.id) ?? []), t]);
  }

  const studySession = view.scheduled.find((t) => prepForOf(t) && !t.done);
  const prep = studySession ? prepForOf(studySession) : null;
  const block = timed.find((i) => isSpaceBlock(i) && !i.done);
  const openHabits = habits.filter((h) => !h.doneToday).length + routines.filter((r) => !r.done).length;
  const next = timed.find((i) => (i.time ?? 0) > clock && !i.proposed && !i.done);
  const sentence = daySentence({
    now: clock,
    classes: events.filter((e) => !isSpaceBlock(e) && !e.done).length,
    due: [...due, ...untimed.filter((i) => i.deadline === day)].filter((i) => !i.done).length,
    study:
      prep && studySession
        ? { test: prep.title.replace(/ \d+$/, ""), length: studySession.length ?? 60 }
        : null,
    habits: openHabits,
    block: block?.spaceName ? { space: block.spaceName, length: block.length ?? 60 } : null,
    left: chips.filter((c) => earlier.includes(c.item)).length,
    freeUntil: isToday && next ? next.time : null,
  });

  return {
    view,
    day,
    isToday,
    now,
    settings,
    dayStart: view.profile.dayStart,
    dayEnd: view.profile.dayEnd,
    reviewTime,
    closed,
    sources,
    entries,
    chips,
    birthdays,
    habits,
    habitItems: habits.map((h) => habitItem(h, view.spaces, day)).filter(keep),
    inClass,
    timed,
    untimed,
    due,
    earlier,
    sentence,
    busy: timed,
  };
}

/** The day before or after, for ← and →. */
export function shiftDay(day: string, by: number): string {
  return addDays(day, by);
}

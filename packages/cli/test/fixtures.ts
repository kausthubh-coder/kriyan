// Real-shaped API results for one person: Europe/London, Tuesday 13 October 2026.
// Typed with the backend's own read models, so a change there breaks these fixtures at compile time.

import type {
  HabitView,
  InboxResult,
  ProgressResult,
  SpacesResult,
  TaskView,
  TodayResult,
  WeekResult,
} from "../src/shapes.ts";

export const TOKEN = "kriyan_test_0123456789abcdef";
/** 10:40 in London. */
export const NOW = "2026-10-13T09:40:00Z";

export const ids = {
  school: "k17school0000000000000000000001",
  calculus: "k17calculus00000000000000000002",
  life: "k17life000000000000000000000003",
  lecture: "k57lecture0000000000000000000001",
  essay: "k57essay000000000000000000000002",
  essayPlan: "k57essayplan00000000000000000003",
  call: "k57callmum0000000000000000000004",
  gym: "k57gym00000000000000000000000005",
  reading: "k57reading000000000000000000006",
  stamps: "k57stamps0000000000000000000007",
  rent: "k57rent00000000000000000000000008",
  problems: "k57problemset0000000000000000009",
  dentist: "k57dentist000000000000000000010",
  readHabit: "k87readhabit00000000000000000001",
  stretch: "k87stretch0000000000000000000002",
} as const;

export function task(fields: Partial<TaskView> & Pick<TaskView, "_id" | "title">): TaskView {
  return {
    spaceId: null,
    color: null,
    spacePath: null,
    date: null,
    time: null,
    length: null,
    deadline: null,
    repeat: null,
    repeatFirst: null,
    repeatText: null,
    reminders: [],
    hasNote: false,
    steps: [],
    event: false,
    goalId: null,
    done: false,
    projected: false,
    proposedBy: null,
    addedBy: null,
    dueTime: null,
    externalId: null,
    ...fields,
  };
}

const school = { spaceId: ids.school, color: "blue" as const, spacePath: "School" };
const calculus = { spaceId: ids.calculus, color: "blue" as const, spacePath: "School / Calculus" };
const life = { spaceId: ids.life, color: "green" as const, spacePath: "Life" };

export const lecture = task({
  _id: ids.lecture,
  title: "Calculus lecture",
  ...calculus,
  date: "2026-10-13",
  time: 600,
  length: 90,
  event: true,
  repeat: { freq: "week", interval: 1, weekdays: [1, 3] },
  repeatFirst: "2026-09-01",
  repeatText: "Every Tue and Thu",
});
export const essay = task({
  _id: ids.essay,
  title: "Essay draft",
  ...school,
  date: "2026-10-13",
  time: 840,
  length: 90,
  reminders: [{ kind: "before", minutes: 60 }],
});
export const callMum = task({ _id: ids.call, title: "Call mum", ...life, date: "2026-10-13", time: 1080 });
export const gym = task({
  _id: ids.gym,
  title: "Gym",
  ...life,
  date: "2026-10-13",
  time: 450,
  length: 60,
  done: true,
  repeat: { freq: "day", interval: 2, fromCompletion: true },
  repeatFirst: "2026-10-01",
  repeatText: "Every 2 days after done",
});
export const reading = task({
  _id: ids.reading,
  title: "Read chapter 4",
  ...school,
  date: "2026-10-13",
  time: 960,
  length: 60,
  proposedBy: "Claude",
});
export const stamps = task({ _id: ids.stamps, title: "Buy stamps", ...life, date: "2026-10-13" });
export const rent = task({ _id: ids.rent, title: "Pay rent", ...life, date: "2026-10-13", done: true });
export const problems = task({ _id: ids.problems, title: "Problem set 3", ...calculus, date: "2026-10-12" });
export const essayPlan = task({ _id: ids.essayPlan, title: "Essay plan", ...school });
export const dentist = task({ _id: ids.dentist, title: "Book the dentist" });

export const habits: HabitView[] = [
  { _id: ids.readHabit, title: "Read", color: "green", target: 5, doneToday: false, thisWeek: 1 },
  { _id: ids.stretch, title: "Stretch", color: null, target: 3, doneToday: true, thisWeek: 2 },
];

export const spaces: SpacesResult = [
  { _id: ids.school, name: "School", color: "blue", parentId: null, depth: 0, path: "School" },
  {
    _id: ids.calculus,
    name: "Calculus",
    color: "blue",
    parentId: ids.school,
    depth: 1,
    path: "School / Calculus",
  },
  { _id: ids.life, name: "Life", color: "green", parentId: null, depth: 0, path: "Life" },
];

export function today(date = "2026-10-13"): TodayResult {
  return {
    date,
    profile: {
      timeZone: "Europe/London",
      dayStart: 480,
      dayEnd: 1320,
      dailyCapacity: 420,
      todayLayout: "blocks",
      earlierWindow: "week",
      showSpace: true,
      hideDone: false,
      nowBadge: true,
      reviewTime: 1200,
    },
    scheduled: [gym, lecture, essay, reading, callMum],
    anytime: [stamps],
    done: [rent],
    due: [],
    earlier: [{ ...problems, ageDays: 1 }],
    habits,
    proposals: 1,
    spaces,
  };
}

const day = (date: string, rest: Partial<WeekResult["days"][number]> = {}): WeekResult["days"][number] => ({
  date,
  isToday: date === "2026-10-13",
  scheduled: [],
  anytime: [],
  deadlines: [],
  plannedMinutes: 0,
  capacity: 420,
  ...rest,
});

export function week(): WeekResult {
  return {
    start: "2026-10-12",
    days: [
      day("2026-10-12", { anytime: [task({ ...problems, date: "2026-10-12" })] }),
      day("2026-10-13", {
        scheduled: [gym, lecture, essay, reading, callMum],
        anytime: [stamps, rent],
        plannedMinutes: 210,
      }),
      day("2026-10-14"),
      day("2026-10-15", {
        scheduled: [{ ...lecture, date: "2026-10-15", projected: true }],
        deadlines: [{ ...essay, deadline: "2026-10-15" }],
      }),
      day("2026-10-16", {
        scheduled: [
          task({
            _id: "k57bigday0000000000000000000011",
            title: "Revision",
            ...school,
            date: "2026-10-16",
            time: 540,
            length: 480,
          }),
        ],
        plannedMinutes: 480,
      }),
      day("2026-10-17"),
      day("2026-10-18"),
    ],
    inbox: [dentist],
    unscheduled: [essayPlan],
    proposals: 1,
  };
}

export const inbox: InboxResult = {
  tasks: [dentist, task({ _id: "k57passport00000000000000000012", title: "Renew passport" })],
  older: [],
};

export function progress(): ProgressResult {
  const days = (count: number, done: (i: number) => boolean) =>
    Array.from({ length: 182 }, (_, i) => ({ date: `d${i}`, done: i >= 182 - count && done(i) }));
  return {
    today: "2026-10-13",
    heat: [],
    weekMinutes: 270,
    weekDone: 6,
    yearMinutes: 7215,
    yearDone: 140,
    bySpace: [
      { spaceId: ids.school, name: "School", color: "blue", minutes: 4800 },
      { spaceId: ids.life, name: "Life", color: "green", minutes: 2415 },
    ],
    goals: [
      {
        _id: "k97run000000000000000000000001",
        title: "Run 100 km",
        why: null,
        kind: "number",
        target: 100,
        current: 42.5,
        unit: "km",
        dueDate: "2026-12-31",
        spaceId: ids.life,
        progress: 0.425,
        pace: 0.6,
        next: null,
      },
      {
        _id: "k97books0000000000000000000002",
        title: "Finish the reading list",
        why: null,
        kind: "tasks",
        target: 12,
        current: 9,
        unit: null,
        dueDate: null,
        spaceId: null,
        progress: 0.75,
        pace: null,
        next: null,
      },
    ],
    habits: habits.map((h) => ({ ...h, days: days(30, (i) => i % 3 === 0) })),
  };
}

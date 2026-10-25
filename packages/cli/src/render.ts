// Plain-text views. Calm and aligned: one table per view, a blank line between sections,
// and colour only for the space dot (and only when the terminal wants colour).

import { todayIn, zonedParts, type CivilDate } from "@kriyan/core/dates";
import {
  dueWhen,
  formatDate,
  formatDay,
  formatDuration,
  formatTime,
  formatTimeRange,
} from "@kriyan/core/format";
import { freeMinutes } from "@kriyan/core/layout";
import { schemes, type SpaceColor } from "@kriyan/core/tokens";

// Terminals are usually dark, so the dots use the dark scheme's colours.
const spaceColor = schemes.dark.space;
import type { Listed } from "./config.ts";
import type {
  GoalView,
  InboxResult,
  ProgressResult,
  SearchResult,
  SpacesResult,
  TaskView,
  TodayResult,
  WeekResult,
} from "./shapes.ts";

export interface View {
  /** Whether to colour the space dots. */
  color: boolean;
  /** The current instant, in ms. */
  now: number;
}

/** Numbers tasks in the order they're shown; a task listed twice keeps its first number. */
export class RefBook {
  readonly tasks: Listed[] = [];
  private readonly numbers = new Map<string, number>();

  ref(task: { _id: string; title: string }): string {
    let n = this.numbers.get(task._id);
    if (n === undefined) {
      this.tasks.push({ id: task._id, title: task.title });
      n = this.tasks.length;
      this.numbers.set(task._id, n);
    }
    return String(n);
  }
}

const ANSI = /\x1b\[[0-9;]*m/g;
const visible = (s: string) => s.replace(ANSI, "").length;

function dot(color: string | null): string {
  if (!color || !(color in spaceColor)) return " ";
  const hex = spaceColor[color as SpaceColor].dot;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `\x1b[38;2;${r};${g};${b}m●\x1b[39m`;
}

/** "● School" in the space's colour when colour is on (a blank where there's no space), else "School". */
function dotted(color: string | null, text: string, view: View): string {
  return view.color ? `${dot(color)} ${text}` : text;
}

type Line = { text: string } | { cells: string[] };

/**
 * Aligns every row of a view on the same columns. Columns empty in every row are dropped;
 * columns listed in `right` (task numbers) align right.
 */
function table(lines: Line[], { indent = "  ", right = [] as number[] } = {}): string {
  const rows = lines.filter((l): l is { cells: string[] } => "cells" in l);
  const count = Math.max(0, ...rows.map((r) => r.cells.length));
  const used = Array.from({ length: count }, (_, c) => rows.some((r) => (r.cells[c] ?? "") !== ""));
  const width = Array.from({ length: count }, (_, c) =>
    Math.max(0, ...rows.map((r) => visible(r.cells[c] ?? ""))),
  );
  return lines
    .map((line) => {
      if ("text" in line) return line.text;
      const cells = line.cells
        .map((cell, c) => ({ cell, c }))
        .filter(({ c }) => used[c])
        .map(({ cell, c }) => {
          const pad = " ".repeat(width[c]! - visible(cell));
          return right.includes(c) ? pad + cell : cell + pad;
        });
      return (indent + cells.join("  ")).trimEnd();
    })
    .join("\n");
}

/** Number, when, title (with its dot), space, status. Use with `table(lines, TASKS)`. */
function taskRow(t: TaskView, when: string, refs: RefBook, view: View, showDone = true): Line {
  const status = t.done && showDone ? "done" : t.proposedBy ? `proposed by ${t.proposedBy}` : "";
  return { cells: [refs.ref(t), when, dotted(t.color, t.title, view), t.spacePath ?? "", status] };
}

const TASKS = { right: [0] };

const when = (t: TaskView) => (t.time === null ? "" : formatTimeRange(t.time, t.length ?? undefined));

/** "due 23:55" for a deadline with a time, else "due". */
const due = (t: { dueTime: number | null }) => (t.dueTime === null ? "due" : `due ${formatTime(t.dueTime)}`);

/** "Today, Tue 13 Oct" or "Wed 21 Oct". */
export function dayLabel(date: CivilDate, today: CivilDate): string {
  const word = formatDay(date, today);
  const full = formatDate(date, today);
  return word === full ? full : `${word}, ${full}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function renderToday(day: TodayResult, view: View, refs: RefBook): string {
  const zone = day.profile.timeZone;
  const today = todayIn(zone, view.now);
  const nowMinutes = zonedParts(view.now, zone).minutes;
  const isToday = day.date === today;
  const out: string[] = [dayLabel(day.date, today)];

  if (isToday) {
    const open = day.scheduled.filter((t) => !t.done && !t.proposedBy && t.time !== null);
    const current = open.find((t) => t.time! <= nowMinutes && t.length && nowMinutes < t.time! + t.length);
    const next = open.find((t) => t.time! > nowMinutes);
    const lines: Line[] = [];
    if (current)
      lines.push({
        cells: ["Now", `${current.title}, until ${formatTime(current.time! + current.length!)}`],
      });
    if (next)
      lines.push({
        cells: [
          "Next",
          `${next.title} at ${formatTime(next.time!)}, in ${formatDuration(next.time! - nowMinutes)}`,
        ],
      });
    if (lines.length) out.push("", table(lines, { indent: "" }));
  }

  const lines: Line[] = [];
  const section = (title: string, tasks: TaskView[], whenOf: (t: TaskView) => string, showDone = true) => {
    if (!tasks.length) return;
    if (lines.length) lines.push({ text: "" });
    lines.push({ text: title });
    for (const t of tasks) lines.push(taskRow(t, whenOf(t), refs, view, showDone));
  };
  section("Schedule", day.scheduled, when);
  section(isToday ? "Due today" : "Due that day", day.due, (t) => (t.dueTime === null ? "" : due(t)));
  section("Anytime", day.anytime, () => "");
  section("From earlier", day.earlier, (t) => (t.date ? formatDate(t.date, today) : ""));
  section("Done", day.done, () => "", false);
  if (lines.length) out.push("", table(lines, TASKS));

  const left =
    day.scheduled.filter((t) => !t.done).length + day.due.length + day.anytime.length + day.earlier.length;
  if (left === 0)
    out.push(
      "",
      day.done.length || day.scheduled.length
        ? `Nothing left ${isToday ? "today" : "that day"}.`
        : isToday
          ? 'Nothing planned. Add a task with: kriyan add "call mum 5pm"'
          : "Nothing planned.",
    );

  if (day.habits.length) {
    out.push("", "Habits");
    out.push(
      table(
        day.habits.map((h) => ({
          cells: [
            dotted(h.color, h.title, view),
            `${h.thisWeek} of ${h.target} this week`,
            h.doneToday ? "done today" : "",
          ],
        })),
      ),
    );
  }

  const busy = day.scheduled
    .filter((t) => !t.done && !t.proposedBy && t.time !== null)
    .map((t) => ({ id: t._id, start: t.time!, ...(t.length ? { length: t.length } : {}) }));
  const { dayStart, dayEnd } = day.profile;
  if (isToday) {
    const free = freeMinutes(busy, Math.max(nowMinutes, dayStart), dayEnd);
    out.push(
      "",
      free > 0
        ? `Free time left: ${formatDuration(free)} until ${formatTime(dayEnd)}`
        : `No free time left before ${formatTime(dayEnd)}.`,
    );
  } else if (day.date > today) {
    const free = freeMinutes(busy, dayStart, dayEnd);
    out.push(
      "",
      `Free time: ${formatDuration(free)} between ${formatTime(dayStart)} and ${formatTime(dayEnd)}`,
    );
  }

  if (day.proposals > 0)
    out.push(
      "",
      `${plural(day.proposals, "proposed block")} ${day.proposals === 1 ? "is" : "are"} waiting for you in the app.`,
    );
  return out.join("\n");
}

export function renderWeek(week: WeekResult, view: View, refs: RefBook, today: CivilDate): string {
  const out: string[] = [`Week of ${formatDate(week.start, today)}`];
  const labels = week.days.map((d) =>
    d.isToday ? `${formatDate(d.date, today)}, today` : formatDate(d.date, today),
  );
  const labelWidth = Math.max(...labels.map((l) => l.length));
  const lines: Line[] = [];
  week.days.forEach((d, i) => {
    const planned = d.plannedMinutes;
    let load = "";
    if (planned > 0 && planned <= d.capacity)
      load = `${formatDuration(planned)} of ${formatDuration(d.capacity)} planned`;
    else if (planned > d.capacity)
      load = `${formatDuration(planned)} planned, ${formatDuration(planned - d.capacity)} over your ${formatDuration(d.capacity)}`;
    lines.push({ text: "" }, { text: load ? `${labels[i]!.padEnd(labelWidth)}  ${load}` : labels[i]! });
    for (const t of d.scheduled) lines.push(taskRow(t, when(t), refs, view));
    for (const t of d.anytime) lines.push(taskRow(t, "", refs, view));
    for (const t of d.deadlines) lines.push(taskRow(t, due(t), refs, view));
    if (!d.scheduled.length && !d.anytime.length && !d.deadlines.length)
      lines.push({ text: "  Nothing planned" });
  });
  const section = (title: string, tasks: TaskView[]) => {
    if (!tasks.length) return;
    lines.push({ text: "" }, { text: title });
    for (const t of tasks) lines.push(taskRow(t, "", refs, view));
  };
  section("Inbox", week.inbox);
  section("No date yet", week.unscheduled);
  out.push(table(lines, TASKS));
  if (week.proposals > 0)
    out.push(
      "",
      `${plural(week.proposals, "proposed block")} ${week.proposals === 1 ? "is" : "are"} waiting for you in the app.`,
    );
  return out.join("\n");
}

export function renderInbox(inbox: InboxResult, view: View, refs: RefBook): string {
  if (!inbox.tasks.length && !inbox.older.length)
    return 'Your inbox is empty. Capture a task with: kriyan add "buy stamps"';
  const lines: Line[] = inbox.tasks.map((t) => taskRow(t, "", refs, view));
  // Leftovers too old for Today's window wait here, so they're never out of sight.
  if (inbox.older.length) {
    if (lines.length) lines.push({ text: "" });
    lines.push({ text: "Older, not on Today" });
    for (const t of inbox.older) lines.push(taskRow(t, `${plural(t.ageDays, "day")} ago`, refs, view));
  }
  return ["Inbox", table(lines, TASKS)].join("\n");
}

/** Search results: number, when it's planned (or due), title, space and anything not open. */
export function renderSearch(found: SearchResult, refs: RefBook, today: CivilDate): string {
  if (!found.tasks.length) return "No tasks match.";
  const rows = found.tasks.map((t): Line => {
    const planned = t.date
      ? `${formatDate(t.date, today)}${t.time !== null ? ` ${formatTime(t.time)}` : ""}`
      : t.deadline
        ? `due ${dueWhen(t.deadline, t.dueTime, today)}`
        : "";
    return {
      cells: [
        refs.ref({ _id: t.taskId, title: t.title }),
        planned,
        t.title,
        t.spacePath ?? "",
        t.status === "open" ? "" : t.status,
      ],
    };
  });
  const more = found.cursor
    ? ["", "There are more. Narrow the words, or add --json to page with the cursor."]
    : [];
  return [table(rows, TASKS), ...more].join("\n");
}

export function renderSpaces(spaces: SpacesResult, view: View): string {
  if (!spaces.length) return 'No spaces yet. Add one with: kriyan add "first task #school"';
  return spaces
    .map((s) => {
      return `${"  ".repeat(s.depth)}${dotted(s.color, s.name, view)}`;
    })
    .join("\n");
}

const number = (n: number) => String(Math.round(n * 10) / 10);

function goalLine(g: GoalView, today: CivilDate): Line {
  const unit = g.kind === "tasks" ? (g.target === 1 ? " task" : " tasks") : g.unit ? ` ${g.unit}` : "";
  const amount = `${number(g.current)} of ${number(g.target)}${unit}`;
  const pace =
    g.progress >= 1 ? "reached" : g.pace === null ? "" : g.progress >= g.pace ? "on pace" : "behind pace";
  const due = g.dueDate ? `by ${formatDate(g.dueDate, today)}` : "";
  return {
    cells: [g.title, amount, `${Math.round(g.progress * 100)}%`, [pace, due].filter(Boolean).join(", ")],
  };
}

export function renderProgress(p: ProgressResult, view: View): string {
  const out: string[] = [
    "Time done",
    table([
      { cells: ["This week", formatDuration(p.weekMinutes)] },
      { cells: ["Last 12 months", formatDuration(p.yearMinutes)] },
    ]),
  ];
  if (p.bySpace.length) {
    out.push("", "By space");
    out.push(
      table(p.bySpace.map((s) => ({ cells: [dotted(s.color, s.name, view), formatDuration(s.minutes)] }))),
    );
  }
  if (p.goals.length) out.push("", "Goals", table(p.goals.map((g) => goalLine(g, p.today))));
  if (p.habits.length) {
    out.push("", "Habits");
    out.push(
      table(
        p.habits.map((h) => {
          const last30 = h.days.slice(-30).filter((d) => d.done).length;
          return {
            cells: [
              dotted(h.color, h.title, view),
              `${h.thisWeek} of ${h.target} this week`,
              `${last30} in the last 30 days`,
            ],
          };
        }),
      ),
    );
  }
  if (!p.weekMinutes && !p.yearMinutes && !p.goals.length && !p.habits.length)
    return "Nothing done yet. Tick off a task with: kriyan done <task>";
  return out.join("\n");
}

export interface Block {
  title: string;
  date: CivilDate;
  time: number;
  length?: number;
}

/** Proposed blocks, one aligned line each. */
export function renderBlocks(blocks: Block[], today: CivilDate): string {
  return table(
    blocks.map((b) => ({ cells: [formatDate(b.date, today), formatTimeRange(b.time, b.length), b.title] })),
  );
}

// What a sheet says (v5 `taskCard`, `habitCard`, `routineCard`, `fillCard`). The same content sits
// in Joi's floating card on phones and in the right panel on desktop.

import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  ArrowRight,
  Bell,
  CalendarRange,
  Check,
  Pencil,
  Repeat2,
  Sparkles,
  SquareCheck,
  X,
} from "lucide-react-native";
import type { Id } from "@kriyan/convex/dataModel";
import { addDays, diffDays, formatClock, weekday } from "@kriyan/core/dates";
import { describeReminder, describeRepeat, formatDate, MONTH_LONG, WEEKDAY_SHORT } from "@kriyan/core/format";
import type { Reminder } from "@kriyan/core/reminders";
import type { Repeat } from "@kriyan/core/repeat";
import { fillLengths, formatSpan, isSpaceBlock } from "@kriyan/core/today";
import { useClock } from "@/data/time";
import { useGoals, useProgressView, useSpaceView, useTaskDoc, type TaskDoc } from "@/data/views";
import {
  checkHabit,
  completeTask,
  deleteTask,
  errorText,
  fillTask,
  moveTasks,
  reopenTask,
  settleProposal,
  skipTask,
  ticking,
} from "@/features/tasks/actions";
import { useSaveSteps } from "@/features/tasks/steps";
import { c, family, r, s, spaceTone } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { convex } from "@/data/convex";
import { api } from "@kriyan/convex/api";
import { showToast } from "@/ui/toast";
import { GOALS_ROUTE, removeRoutine, tickRoutineAll, tickRoutinePart } from "./links";
import { spaceName, type HabitView, type PrepFor, type RoutineView } from "./model";
import { Facts, InfoCard, Kicker, LenChip, SpaceBox, T, Tiles, WideButton, type TileSpec } from "./parts";

const relDay = (date: string, today: string) => {
  const k = diffDays(date, today);
  if (k === 0) return "Today";
  if (k === 1) return "Tomorrow";
  if (k === -1) return "Yesterday";
  if (k > 1 && k < 7) return WEEKDAY_SHORT[weekday(date)];
  return formatDate(date, today);
};

function reminderText(list: Reminder[]): string {
  return list.map((rem) => describeReminder(rem)).join(", ");
}

/** A task, an event, a suggestion, a birthday, a space's time block or a study session. */
export function ItemCard({
  id,
  day,
  onClose,
  onEdit,
  panel,
}: {
  id: string;
  /** The day it's shown on (a repeat's occurrence); defaults to its own date. */
  day?: string;
  onClose: () => void;
  onEdit: () => void;
  /** The desktop panel: two columns of shorter tiles. */
  panel?: boolean;
}) {
  const task = useTaskDoc(id as Id<"tasks">);
  const { today, now } = useClock();
  if (task === undefined) return <View style={{ height: 240 }} aria-busy />;
  if (task === null)
    return (
      <View style={{ gap: s.s3 }}>
        <T s="h2">This task isn’t here anymore</T>
        <T s="row" tone="ink2">
          It was deleted, or it belongs to another account. Your other tasks are unchanged.
        </T>
        <WideButton label="Close" onPress={onClose} />
      </View>
    );
  return (
    <TaskCardBody
      task={task}
      day={day ?? task.date ?? today}
      today={today}
      now={now}
      onClose={onClose}
      onEdit={onEdit}
      panel={panel}
    />
  );
}

function TaskCardBody({
  task,
  day,
  today,
  now,
  onClose,
  onEdit,
  panel,
}: {
  task: TaskDoc;
  day: string;
  today: string;
  now: number;
  onClose: () => void;
  onEdit: () => void;
  panel?: boolean;
}) {
  const isTicking = ticking.useValue((t) => Boolean(t[task._id]));
  const done = task.doneAt !== undefined || isTicking;
  const name = spaceName(task.spacePath);
  const tone = spaceTone(task.color);
  const block = isSpaceBlock({
    kind: task.event ? "event" : "task",
    spaceId: task.spaceId ?? null,
    title: task.title,
    spaceName: name,
  });
  const yearly = task.repeat?.freq === "year";
  const prep = task.prepTest
    ? { ...task.prepTest, daysLeft: task.prepTest.date ? diffDays(task.prepTest.date, day) : null }
    : null;
  const range =
    task.time !== undefined
      ? task.length
        ? `${formatClock(task.time)}–${formatClock(task.time + task.length)}`
        : formatClock(task.time)
      : null;

  const facts: { icon?: typeof Repeat2; dot?: string; text: string }[] = [];
  if (block) facts.push({ icon: CalendarRange, text: "Time for this space" });
  if (name) facts.push({ dot: tone.dot, text: name });
  if (task.repeat && !yearly)
    facts.push({
      icon: Repeat2,
      text: describeRepeat(task.repeat as Repeat, task.repeatFirst ?? task.date ?? day, today),
    });
  if (task.reminders.length) facts.push({ icon: Bell, text: reminderText(task.reminders as Reminder[]) });
  if (task.addedBy && !task.proposedBy)
    facts.push({ icon: Sparkles, text: `From ${task.addedBy === "An agent" ? "an agent" : task.addedBy}` });

  let kicker: string | null = null;
  let sub = "";
  if (task.proposedBy) {
    kicker = `Suggested by ${task.proposedBy}`;
    sub = `${formatDate(day, today)}${range ? `, ${range}` : ""}`;
  } else if (yearly) {
    kicker = "Birthday";
    sub = `${formatDate(day, today)}, every year`;
  } else if (task.event) {
    kicker = "Event";
    sub = `${formatDate(day, today)}${range ? `, ${range}` : ""}`;
  } else {
    const when = range ? `${relDay(day, today)}, ${range}` : task.date ? relDay(day, today) : "No day yet";
    const due = task.deadline
      ? `due ${task.deadline === day ? "" : formatDate(task.deadline, today)}${task.dueTime !== undefined ? `${task.deadline === day ? "" : ", "}${formatClock(task.dueTime)}` : task.deadline === day ? "today" : ""}`
      : "";
    sub =
      task.date || range
        ? [when, due].filter(Boolean).join(", ")
        : task.deadline
          ? due.replace(/^due/, "Due")
          : "No day yet";
  }

  const target = !task.date || task.date < today ? today : addDays(day, 1);
  const placement = { _id: task._id, title: task.title, date: task.date ?? null, time: task.time ?? null };
  let tiles: TileSpec[];
  let columns = 4;
  if (task.proposedBy) {
    tiles = [
      {
        label: "Accept",
        icon: SquareCheck,
        tone: "primary",
        onPress: () => (onClose(), void settleProposal(task, true)),
      },
      { label: "Not now", icon: ArrowRight, onPress: () => (onClose(), void settleProposal(task, false)) },
    ];
    columns = 2;
  } else if (yearly) {
    tiles = [
      { label: "Edit", icon: Pencil, onPress: onEdit },
      { label: "Remove", icon: X, tone: "red", onPress: () => deleteTask(task, onClose) },
    ];
    columns = 2;
  } else if (task.event) {
    tiles = [
      { label: "Edit", icon: Pencil, onPress: onEdit },
      ...(task.repeat
        ? [
            {
              label: "Skip once",
              icon: ArrowRight,
              onPress: () => (
                onClose(),
                void skipTask({ _id: task._id, title: task.title, time: task.time ?? null })
              ),
            },
          ]
        : []),
      { label: "Remove", icon: X, tone: "red" as const, onPress: () => deleteTask(task, onClose) },
    ];
    columns = tiles.length;
  } else {
    tiles = [
      {
        label: done ? "Undo" : "Complete",
        name: done ? `Mark not done: ${task.title}` : `Complete ${task.title}`,
        icon: SquareCheck,
        onPress: () => {
          if (task.doneAt !== undefined) reopenTask(task._id);
          else if (!isTicking) {
            completeTask({ _id: task._id, title: task.title, date: day, event: task.event });
            onClose();
          }
        },
      },
      {
        label: target === today ? "Today" : "Tomorrow",
        icon: ArrowRight,
        onPress: () => (onClose(), void moveTasks([placement], target)),
      },
      { label: "Edit", icon: Pencil, onPress: onEdit },
      { label: "Remove", icon: X, tone: "red", onPress: () => deleteTask(task, onClose) },
    ];
  }
  if (panel) columns = 2;

  // An event today: how long until it starts, or that it's on now.
  const until = task.event && day === today && task.time !== undefined ? task.time - now : null;
  return (
    <View>
      {kicker ? <Kicker tone={task.proposedBy ? "parse" : "ink2"}>{kicker}</Kicker> : null}
      <T s="h2" extra={{ marginTop: kicker ? s.s1 : 0 }}>
        {task.title}
      </T>
      <T s="sub" tone="ink3" extra={{ marginTop: s.s1 }}>
        {sub}
      </T>
      <Facts items={facts} />
      {task.note ? (
        <T s="body" tone="ink2" extra={{ marginTop: s.s3 }}>
          {task.note}
        </T>
      ) : null}
      {prep ? <StudyFacts prep={prep} task={task} day={day} /> : null}
      {block && task.spaceId ? <NextInSpace spaceId={task.spaceId} name={name ?? "this space"} /> : null}
      {task.goalId ? <GoalLine goalId={task.goalId} /> : null}
      {task.steps?.length ? <Steps task={task} /> : null}
      {until !== null && task.length ? (
        until > 0 ? (
          <InfoCard center>
            <T s="title">{`In ${formatSpan(until)}`}</T>
          </InfoCard>
        ) : until > -task.length ? (
          <InfoCard center>
            <T s="title" tone="now">
              Happening now
            </T>
          </InfoCard>
        ) : null
      ) : null}
      <Tiles tiles={tiles} columns={columns} height={panel ? 64 : 80} />
    </View>
  );
}

/** "CSC 316 exam 2 in 7 days" and which session this is. */
function StudyFacts({ prep, task, day }: { prep: PrepFor; task: TaskDoc; day: string }) {
  const first = task.repeatFirst ?? task.date ?? day;
  const end = task.repeat?.end?.kind === "on" ? task.repeat.end.date : null;
  const step = task.repeat?.freq === "day" ? task.repeat.interval : null;
  const session = step ? Math.floor(diffDays(day, first) / step) + 1 : null;
  const of = step && end ? Math.floor(diffDays(end, first) / step) + 1 : null;
  return (
    <InfoCard>
      <T s="title">
        {prep.daysLeft === null
          ? `For ${prep.title}`
          : prep.daysLeft <= 0
            ? `${prep.title} is today`
            : `${prep.title} in ${prep.daysLeft} ${prep.daysLeft === 1 ? "day" : "days"}`}
      </T>
      <T s="body" tone="ink2" extra={{ marginTop: 2 }}>
        {`${prep.date ? `${formatDate(prep.date)}.` : ""}${session && of ? ` Session ${session} of ${of}${task.length ? `, ${formatSpan(task.length)} a day` : ""}.` : ""}`}
      </T>
    </InfoCard>
  );
}

function NextInSpace({ spaceId, name }: { spaceId: Id<"spaces">; name: string }) {
  const view = useSpaceView(spaceId);
  const { today } = useClock();
  const tasks = view ? [...view.next, ...view.later].filter((t) => !t.event).slice(0, 6) : [];
  return (
    <View style={{ marginTop: s.s4 }}>
      <T s="strong" tone="ink3">{`Next in ${name}`}</T>
      {view && !tasks.length ? (
        <T s="row" tone="ink3" extra={{ paddingVertical: s.s4, textAlign: "center" }}>
          Nothing open. Add one with +.
        </T>
      ) : null}
      {tasks.map((t) => (
        <View key={t._id} style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 40 }}>
          <SpaceBox
            color={t.color}
            done={false}
            size={18}
            label={`Complete ${t.title}`}
            onPress={() => completeTask(t)}
          />
          <T s="row" lines={1} extra={{ flex: 1 }}>
            {t.title}
          </T>
          {t.deadline ? (
            <T s="body" tone="ink3" tnum>
              {`Due ${formatDate(t.deadline, today)}`}
            </T>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function GoalLine({ goalId }: { goalId: string }) {
  const goals = useGoals();
  const goal = goals?.find((g) => g._id === goalId);
  if (!goal) return null;
  return (
    <Txt style={{ ...family("500"), fontSize: 14, lineHeight: 20, color: c.ink2, marginTop: s.s3 }}>
      Counts toward <Txt style={{ ...family("600"), fontSize: 14, color: c.ink }}>{goal.title}</Txt>
      {`: ${goal.current} of ${goal.target}${goal.unit ? ` ${goal.unit}` : ""}`}
    </Txt>
  );
}

/** A task's steps, ticked in the sheet. */
function Steps({ task }: { task: TaskDoc }) {
  const save = useSaveSteps(task._id);
  const steps = task.steps ?? [];
  return (
    <View style={{ marginTop: s.s4 }} accessibilityLabel="Steps">
      {steps.map((st, i) => (
        <View
          key={`${i}:${st.title}`}
          style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 36 }}
        >
          <SpaceBox
            color={null}
            done={st.done}
            size={18}
            label={`Step ${st.title}`}
            onPress={() => save(steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
          />
          <T s="row" tone={st.done ? "ink3" : "ink"} strike={st.done} extra={{ flex: 1 }}>
            {st.title}
          </T>
        </View>
      ))}
    </View>
  );
}

/** A habit: Done today, its weeks, and the month's dots. */
export function HabitCard({
  habit,
  day,
  onClose,
  panel,
}: {
  habit: HabitView;
  day: string;
  onClose: () => void;
  panel?: boolean;
}) {
  const progress = useProgressView();
  const history = progress?.habits.find((h) => h._id === habit._id)?.days ?? [];
  const [y, m] = day.split("-").map(Number) as [number, number];
  const monthKey = day.slice(0, 7);
  const first = `${monthKey}-01`;
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const checked = new Set(history.filter((d) => d.done).map((d) => d.date));
  if (habit.doneToday) checked.add(day);
  const weeks = new Map<string, number>();
  for (const d of checked) {
    const wk = addDays(d, -weekday(d));
    weeks.set(wk, (weeks.get(wk) ?? 0) + 1);
  }
  const best = Math.max(habit.thisWeek, ...weeks.values());
  const inMonth = [...checked].filter((d) => d.startsWith(monthKey)).length;
  const lead = weekday(first);
  const goals = useGoals();
  const goal = habit.goalId ? goals?.find((g) => g._id === habit.goalId) : null;
  return (
    <View>
      <Kicker>{`Habit, ${habit.target === 7 ? "every day" : `${habit.target} times a week`}`}</Kicker>
      <T s="h2" extra={{ marginTop: s.s1 }}>
        {habit.title}
      </T>
      <Tiles
        columns={panel ? 2 : 3}
        height={panel ? 64 : 80}
        tiles={[
          {
            label: habit.doneToday ? "Undo" : "Done today",
            icon: SquareCheck,
            onPress: () => void checkHabit(habit, day, !habit.doneToday),
          },
          { label: "Edit", icon: Pencil, onPress: () => (onClose(), router.push(GOALS_ROUTE)) },
          {
            label: "Remove",
            icon: X,
            tone: "red",
            onPress: () => {
              onClose();
              void convex
                .mutation(api.organize.updateHabit, { id: habit._id, archived: true })
                .then(() =>
                  showToast(`Removed ${habit.title}`, {
                    label: "Undo",
                    run: () =>
                      void convex.mutation(api.organize.updateHabit, { id: habit._id, archived: false }),
                  }),
                )
                .catch((e: unknown) => showToast(errorText(e)));
            },
          },
        ]}
      />
      <Stats
        items={[
          [String(best), "Best week"],
          [`${habit.thisWeek} of ${habit.target}`, "This week"],
          [String(checked.size), "Total"],
        ]}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: s.s6 }}>
        <T s="title">{MONTH_LONG[m - 1] ?? ""}</T>
        <T s="title" tone="ink3" tnum>{`${inMonth} of ${daysIn}`}</T>
      </View>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", marginTop: s.s4, rowGap: s.s4 }}
        aria-label="This month"
      >
        {Array.from({ length: Math.ceil((lead + daysIn) / 7) * 7 }, (_, k) => {
          const dnum = k - lead + 1;
          const date = `${monthKey}-${String(dnum).padStart(2, "0")}`;
          const real = dnum >= 1 && dnum <= daysIn;
          const on = real && checked.has(date);
          return (
            <View
              key={k}
              style={{ width: `${100 / 7}%`, alignItems: "center", justifyContent: "center", height: 16 }}
            >
              {real ? (
                <View
                  style={{
                    width: on ? 14 : 10,
                    height: on ? 14 : 10,
                    borderRadius: 7,
                    backgroundColor: on ? c.ink : c.lineStrong,
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      {goal ? <T s="body" tone="ink2" extra={{ marginTop: s.s4 }}>{`Counts toward ${goal.title}`}</T> : null}
      <T s="body" tone="ink2" extra={{ marginTop: s.s4 }}>
        Counted by week. Missing a day never resets anything.
      </T>
    </View>
  );
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <View style={{ flexDirection: "row", marginTop: s.s6 }}>
      {items.map(([big, small]) => (
        <View key={small} style={{ flex: 1, alignItems: "center" }}>
          <Txt tnum style={{ ...family("600"), fontSize: 20, lineHeight: 28, color: c.ink }}>
            {big}
          </Txt>
          <T s="small" tone="ink2">
            {small}
          </T>
        </View>
      ))}
    </View>
  );
}

/** A routine: tick each part, All done, its streak. */
export function RoutineCard({
  routine,
  habits,
  day,
  onClose,
  panel,
}: {
  routine: RoutineView;
  habits: HabitView[];
  day: string;
  onClose: () => void;
  panel?: boolean;
}) {
  const done = routine.parts.filter((p) => p.done).length;
  const tone = spaceTone(routine.color);
  return (
    <View>
      <Kicker>{`Routine, every day, ${formatClock(routine.time)}–${formatClock(routine.time + routine.length)}`}</Kicker>
      <T s="h2" extra={{ marginTop: s.s1 }}>
        {routine.title}
      </T>
      <View style={{ marginTop: s.s3 }}>
        {routine.parts.map((p) => {
          const habit = p.habitId ? habits.find((h) => h._id === p.habitId) : null;
          return (
            <Press
              key={p.index}
              role="checkbox"
              aria-checked={p.done}
              accessibilityLabel={p.title}
              onPress={() => tickRoutinePart(routine, p.index, day, !p.done)}
              hoverBg={null}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s3, paddingVertical: s.s2 }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: r.ctl,
                  borderWidth: 2,
                  borderColor: p.done ? c.lineStrong : tone.dot,
                  backgroundColor: p.done ? c.lineStrong : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {p.done ? <Icon icon={Check} size={16} tone="onInk" strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Txt style={{ ...family("500"), fontSize: 16, lineHeight: 24 }}>
                  <Txt
                    style={{
                      ...family("500"),
                      fontSize: 16,
                      color: p.done ? c.ink3 : c.ink,
                      textDecorationLine: p.done ? "line-through" : "none",
                    }}
                  >
                    {p.title}
                  </Txt>
                  {p.length ? (
                    <Txt
                      style={{ ...family("400"), fontSize: 14, color: c.ink3 }}
                    >{`  ${formatSpan(p.length)}`}</Txt>
                  ) : null}
                </Txt>
                {habit ? (
                  <T s="small" tone="ink2">{`Habit, ${habit.thisWeek} of ${habit.target} this week`}</T>
                ) : null}
              </View>
            </Press>
          );
        })}
      </View>
      <Stats
        items={[
          [String(routine.streak), "Days in a row"],
          [`${done} of ${routine.parts.length}`, "Today"],
          [formatSpan(routine.length), "Today's length"],
        ]}
      />
      <Tiles
        columns={panel ? 2 : 3}
        height={panel ? 64 : 80}
        tiles={[
          {
            label: routine.done ? "Undo all" : "All done",
            icon: SquareCheck,
            onPress: () => (tickRoutineAll(routine, day, !routine.done), onClose()),
          },
          { label: "Edit", icon: Pencil, onPress: () => (onClose(), router.push(GOALS_ROUTE)) },
          { label: "Remove", icon: X, tone: "red", onPress: () => (onClose(), removeRoutine(routine)) },
        ]}
      />
      <T s="body" tone="ink2" extra={{ marginTop: s.s4 }}>
        Habits inside a routine still keep their own weekly count and goal.
      </T>
    </View>
  );
}

export interface FillCandidate {
  id: string;
  title: string;
  note: string;
  date: string | null;
  time: number | null;
  length: number | null;
}

/** Fill a free stretch: pick a task, pick a length (never guessed), put it there. */
export function FillCard({
  from,
  to,
  day,
  candidates,
  preselect,
  onClose,
}: {
  from: number;
  to: number;
  day: string;
  candidates: FillCandidate[];
  preselect: string | null;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(preselect);
  const [length, setLength] = useState<number | null>(null);
  const room = to - from;
  const choice = candidates.find((t) => t.id === picked) ?? null;
  return (
    <View>
      <Kicker>{`${formatSpan(room)} free`}</Kicker>
      <T s="h2" extra={{ marginTop: s.s1 }}>{`Fill ${formatClock(from)}–${formatClock(to)}`}</T>
      <View style={{ marginTop: s.s3 }} role="radiogroup" aria-label="Tasks to fit in">
        {candidates.map((t) => {
          const on = t.id === picked;
          return (
            <Press
              key={t.id}
              role="radio"
              aria-checked={on}
              accessibilityLabel={t.title}
              onPress={() => (setPicked(t.id), setLength(null))}
              hoverBg={null}
              style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 52 }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: on ? 7 : 2,
                  borderColor: on ? c.parse : c.lineStrong,
                }}
              />
              <T s="row" tone={on ? "parse" : "ink"} lines={1} extra={{ flex: 1 }}>
                {t.title}
              </T>
              <T s="small" tone="ink2" tnum>
                {t.note}
              </T>
            </Press>
          );
        })}
        {!candidates.length ? (
          <T s="row" tone="ink3" extra={{ textAlign: "center", paddingVertical: s.s8 }}>
            Nothing waiting. Enjoy the time.
          </T>
        ) : null}
      </View>
      {choice ? (
        <>
          <T s="body" tone="ink2" extra={{ marginTop: s.s4 }}>
            How long?
          </T>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s3 }}
            role="radiogroup"
          >
            {fillLengths(room).map((x) => (
              <LenChip key={x} label={formatSpan(x)} on={length === x} onPress={() => setLength(x)} />
            ))}
          </View>
          <WideButton
            label={length ? `Put it at ${formatClock(from)}–${formatClock(from + length)}` : "Pick how long"}
            disabled={!length}
            onPress={() => {
              if (!length) return;
              onClose();
              void fillTask(
                {
                  _id: choice.id as Id<"tasks">,
                  title: choice.title,
                  date: choice.date,
                  time: choice.time,
                  length: choice.length,
                },
                day,
                from,
                length,
              );
            }}
          />
        </>
      ) : (
        <T s="body" tone="ink2" extra={{ marginTop: s.s4 }}>
          Pick something, then say how long. Kriyan never guesses a length.
        </T>
      )}
    </View>
  );
}

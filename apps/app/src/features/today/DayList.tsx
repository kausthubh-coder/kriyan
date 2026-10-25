// Today as a list, one line per item (Settings: Today shows a list). The order is the
// prototype's: birthdays, Wake up and the morning routine, what's already over, what's left
// from this week, what's due, the rest of the day in time order, tasks with no time, habits, the
// night routine, Wind down.

import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Asterisk, Calendar, CalendarRange, ListChecks, Moon, Sparkles, Sun } from "lucide-react-native";
import { addDays, formatClock } from "@kriyan/core/dates";
import { isSpaceBlock, rowFact, showsSpaceName, type DayItem } from "@kriyan/core/today";
import type { TaskView } from "@/data/views";
import { selection } from "@/features/shell/context";
import { rowRegistry } from "@/features/shell/rows";
import { completeTask, moveTasks, reopenTask, ticking } from "@/features/tasks/actions";
import { LineRow } from "@/features/tasks/LineRow";
import { DayPicker } from "@/features/tasks/pickers";
import { c, hex, spaceTone } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import type { BlockHandlers } from "./Blocks";
import { Pill, SpaceBox } from "./parts";
import type { Day } from "./useDay";

export function DayList({ day, on }: { day: Day; on: BlockHandlers }) {
  const selected = selection.useValue((st) => st.taskId);
  const [picking, setPicking] = useState<TaskView | null>(null);
  const timed = [...day.timed];
  const morning = timed.filter((i) => i.kind === "routine" && (i.time ?? 0) < 12 * 60);
  const night = timed.filter((i) => i.kind === "routine" && (i.time ?? 0) >= 21 * 60);
  const rest = timed.filter((i) => !morning.includes(i) && !night.includes(i));
  const over = day.now !== null ? rest.filter((i) => (i.time ?? 0) + (i.length ?? 0) <= day.now!) : [];
  const ahead = rest.filter((i) => !over.includes(i));
  const leftIds = new Set(day.chips.filter((ch) => day.earlier.includes(ch.item)).map((ch) => ch.item.id));
  const left = day.earlier.filter((i) => leftIds.has(i.id));
  const dueIds = new Set(day.due.map((i) => i.id));
  const rows: ReactNode[] = [];
  const add = (item: DayItem, group?: "left") =>
    rows.push(
      <ItemRow
        key={`${group ?? ""}${item.id}`}
        item={item}
        day={day}
        on={on}
        left={group === "left"}
        selected={selected === item.id}
        onPick={setPicking}
      />,
    );
  const anchor = (kind: "wake" | "review" | "wind", time: number) =>
    rows.push(
      <LineRow
        key={kind}
        title={kind === "wake" ? "Wake up" : kind === "wind" ? "Wind down" : day.closed ? "Day closed" : "Review today"}
        spaceName={null}
        icon={
          kind === "wake" ? (
            <Icon icon={Sun} size={22} color={spaceTone("yellow").dotHex} strokeWidth={2.25} />
          ) : kind === "wind" ? (
            <Icon icon={Moon} size={22} color={spaceTone("purple").dotHex} strokeWidth={2.25} />
          ) : (
            <Icon icon={ListChecks} size={22} tone="ink3" />
          )
        }
        fact={
          kind === "review" && day.now !== null && day.now >= time && !day.closed
            ? { text: "Now", now: true }
            : { text: formatClock(time) }
        }
        past={kind !== "review" && day.now !== null && time < day.now}
        label={kind === "review" ? "Review today" : kind === "wake" ? "Wake up" : "Wind down"}
        onPress={kind === "review" ? on.review : on.anchor}
      />,
    );

  for (const b of day.birthdays)
    rows.push(
      <LineRow
        key={b._id}
        testID={`task-${b._id}`}
        title={b.title}
        spaceName={null}
        icon={<Icon icon={Asterisk} size={22} tone="now" strokeWidth={2.75} />}
        fact={null}
        label={`Open ${b.title}`}
        onPress={() => on.open(b._id)}
      />,
    );
  anchor("wake", day.dayStart);
  morning.forEach((i) => add(i));
  over.forEach((i) => add(i));
  left.forEach((i) => add(i, "left"));
  day.due.filter((i) => !(day.settings.hideDone && i.done)).forEach((i) => add(i));
  // The review row takes its place among the rest of the day.
  let reviewed = day.reviewTime === null;
  for (const i of ahead) {
    if (!reviewed && (i.time ?? 0) > day.reviewTime!) {
      anchor("review", day.reviewTime!);
      reviewed = true;
    }
    add(i);
  }
  if (!reviewed) anchor("review", day.reviewTime!);
  day.untimed.filter((i) => !dueIds.has(i.id)).forEach((i) => add(i));
  day.habitItems.forEach((i) => add(i));
  night.forEach((i) => add(i));
  anchor("wind", day.dayEnd);

  return (
    <View aria-label="Today's list">
      {rows}
      <Popover open={picking !== null} onClose={() => setPicking(null)} title="Move to a day">
        {picking ? (
          <DayPicker
            value={picking.date}
            today={day.view.date}
            allowNone={false}
            onPick={(date) => {
              const t = picking;
              setPicking(null);
              if (date && date !== t.date) void moveTasks([t], date);
            }}
          />
        ) : null}
      </Popover>
    </View>
  );
}

function ItemRow({
  item,
  day,
  on,
  left,
  selected,
  onPick,
}: {
  item: DayItem;
  day: Day;
  on: BlockHandlers;
  left: boolean;
  selected: boolean;
  onPick: (t: TaskView) => void;
}) {
  const src = day.sources.get(item.id);
  const task = src?.type === "task" ? src.task : null;
  const routine = src?.type === "routine" ? src.routine : null;
  const habit = src?.type === "habit" ? src.habit : null;
  const isTicking = ticking.useValue((t) => Boolean(task && t[task._id]));
  useEffect(() => {
    if (!task) return;
    rowRegistry.set(task._id, task);
    return () => {
      rowRegistry.delete(task._id);
    };
  }, [task]);
  const done = item.done || isTicking;
  const color = task?.color ?? routine?.color ?? habit?.color ?? null;
  const tick = () => {
    if (!task) return;
    if (task.done) {
      if (!task.repeat) reopenTask(task._id);
    } else if (!isTicking) completeTask(task);
  };
  const icon = routine ? (
    <SpaceBox shape="ring" color={color} done={done} label={`Open ${item.title}`} />
  ) : habit ? (
    <SpaceBox
      shape="dash"
      color={color}
      done={done}
      label={`${done ? "Not done yet" : "Check off"}: ${item.title}`}
      onPress={() => on.tickHabit(item.id)}
    />
  ) : task?.proposedBy ? (
    <Icon icon={Sparkles} size={20} tone="parse" />
  ) : task && isSpaceBlock(item) ? (
    <Icon icon={CalendarRange} size={22} color={spaceTone(color).dotHex} strokeWidth={2} />
  ) : task?.event ? (
    <Icon icon={Calendar} size={22} color={color && day.settings.showSpace ? spaceTone(color).dotHex : hex.ink3} strokeWidth={2} />
  ) : task ? (
    <SpaceBox
      color={day.settings.showSpace ? color : null}
      done={done}
      disabled={task.projected}
      label={`${done ? "Mark not done" : "Complete"}: ${task.title}`}
      onPress={tick}
    />
  ) : null;
  const fact = routine
    ? done
      ? null
      : {
          text: `${routine.parts.filter((p) => p.done).length ? `${routine.parts.filter((p) => p.done).length} of ${routine.parts.length}, ` : ""}${formatClock(routine.time)}–${formatClock(routine.time + routine.length)}`,
        }
    : rowFact(item, {
        day: day.day,
        now: day.now,
        left,
        ...(habit ? { habit: { done: habit.thisWeek, target: habit.target } } : {}),
      });
  const pill = routine && done ? <Pill kind="streak" text={`${routine.streak} days`} /> : task?.proposedBy ? <Pill kind="sug" text="Suggested" /> : habit && done ? <Pill kind="streak" text={`${habit.thisWeek} this week`} /> : undefined;
  const past =
    task?.event && day.now !== null && (item.time ?? 0) + (item.length ?? 0) <= day.now ? true : false;
  const target = !task?.date || task.date < day.view.date ? day.view.date : addDays(day.view.date, 1);
  const canMove = task && !task.event && !task.projected && !task.done;
  return (
    <LineRow
      testID={`task-${item.id}`}
      title={item.title}
      spaceName={
        day.settings.showSpace && item.spaceName && showsSpaceName(item.title, item.spaceName) ? item.spaceName : null
      }
      icon={icon}
      fact={done && !habit ? null : fact}
      pill={pill}
      repeats={Boolean(task?.repeat) && !done}
      reminds={Boolean(task?.reminders.length) && !done}
      done={done && !habit}
      past={past}
      proposed={Boolean(task?.proposedBy)}
      selected={selected}
      label={`Open ${item.title}${item.time !== null ? `, ${formatClock(item.time)}${item.length ? `–${formatClock(item.time + item.length)}` : ""}` : ""}`}
      onPress={() => on.open(item.id)}
      swipe={
        canMove
          ? {
              color: task.color ? spaceTone(task.color).dot : c.ink3,
              onComplete: isTicking ? undefined : tick,
              moveLabel: target === day.view.date ? "Today" : "Tomorrow",
              onMove: () => void moveTasks([task], target),
              onPick: () => onPick(task),
            }
          : undefined
      }
    />
  );
}

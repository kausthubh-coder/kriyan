// Today's time blocks (docs/design/v5, `dayTimeline`): the day from Wake up to Wind down. Each
// thing with a length is a block tinted in its space's colour and as tall as it is long; things
// without one are thin rows; free stretches are dashed gaps (the one you're in, red, from now),
// and the block you're in carries the red now line. Classes hold what's due during them; a space's
// time block names the space's next task; a routine shows its parts to tick.

import { memo, useEffect, type ReactNode } from "react";
import { View } from "react-native";
import {
  Asterisk,
  Calendar,
  Check as CheckGlyph,
  CalendarRange,
  ListChecks,
  Moon,
  Plus,
  Sparkles,
  Sun,
} from "lucide-react-native";
import { formatClock } from "@kriyan/core/dates";
import {
  blockHeight,
  dueDayWord,
  formatSpan,
  isLive,
  isSpaceBlock,
  showsSpaceName,
  type DayItem,
} from "@kriyan/core/today";
import { useSpaceView, type TaskView } from "@/data/views";
import { selection } from "@/features/shell/context";
import { rowRegistry } from "@/features/shell/rows";
import { completeTask, reopenTask, ticking } from "@/features/tasks/actions";
import { useIsPhone } from "@/theme/layout";
import { c, family, hex, r, s, spaceTone } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { prepForOf, type RoutineView } from "./model";
import { Pill, SpaceBox, T, ty } from "./parts";
import type { Day, Source } from "./useDay";

/** The hour column's width (v5 `.tlr`: 58). */
const HOURS = 56;

export interface BlockHandlers {
  open: (id: string) => void;
  fill: (from: number, to: number) => void;
  review: () => void;
  anchor: () => void;
  tickRoutinePart: (routine: RoutineView, index: number, done: boolean) => void;
  tickHabit: (id: string) => void;
}

export function Blocks({ day, on }: { day: Day; on: BlockHandlers }) {
  const selected = selection.useValue((st) => st.taskId);
  const rows: ReactNode[] = [];
  for (const b of day.birthdays)
    rows.push(
      <Row key={`b${b._id}`} hour="">
        <Thin
          icon={<Icon icon={Asterisk} size={20} tone="now" strokeWidth={2.75} />}
          title={b.title}
          label={`Open ${b.title}`}
          onPress={() => on.open(b._id)}
          testID={`task-${b._id}`}
        />
      </Row>,
    );
  // Habits without a time of their own sit with the evening, before the night routine.
  const habitsAt = day.entries.findIndex(
    (e) =>
      (e.kind === "anchor" && e.anchor === "wind") ||
      (e.kind === "item" && e.item.kind === "routine" && (e.item.time ?? 0) >= 21 * 60),
  );
  day.entries.forEach((e, i) => {
    if (i === habitsAt)
      for (const h of day.habitItems) {
        const habit = day.sources.get(h.id);
        const target = habit?.type === "habit" ? habit.habit : null;
        rows.push(
          <Row key={`h${h.id}`} hour="">
            <Thin
              icon={
                <SpaceBox
                  shape="dash"
                  color={target?.color ?? null}
                  done={h.done}
                  label={`${h.done ? "Not done yet" : "Check off"}: ${h.title}`}
                  onPress={() => on.tickHabit(h.id)}
                />
              }
              title={h.title}
              done={h.done}
              right={target ? `${target.thisWeek} of ${target.target}` : undefined}
              label={`Open ${h.title}`}
              onPress={() => on.open(h.id)}
              testID={`task-${h.id}`}
              selected={selected === h.id}
            />
          </Row>,
        );
      }
    if (e.kind === "gap") {
      rows.push(
        <Row key={`g${e.from}`} hour="">
          <Gap from={e.from} to={e.to} now={e.now} onPress={() => on.fill(e.from, e.to)} />
        </Row>,
      );
      return;
    }
    if (e.kind === "anchor") {
      const past = day.now !== null && e.time < day.now && e.anchor !== "review";
      const reviewNow = e.anchor === "review" && day.now !== null && day.now >= e.time && !day.closed;
      rows.push(
        <Row key={`a${e.anchor}`} hour={formatClock(e.time)}>
          <Thin
            icon={
              e.anchor === "wake" ? (
                <Icon icon={Sun} size={20} color={spaceTone("yellow").dotHex} strokeWidth={2.25} />
              ) : e.anchor === "wind" ? (
                <Icon icon={Moon} size={20} color={spaceTone("purple").dotHex} strokeWidth={2.25} />
              ) : (
                <Icon icon={ListChecks} size={20} tone="ink3" />
              )
            }
            title={
              e.anchor === "wake"
                ? "Wake up"
                : e.anchor === "wind"
                  ? "Wind down"
                  : day.closed
                    ? "Day closed"
                    : "Review today"
            }
            past={past}
            pill={reviewNow ? "Now" : undefined}
            label={e.anchor === "review" ? "Review today" : e.anchor === "wake" ? "Wake up" : "Wind down"}
            onPress={e.anchor === "review" ? on.review : on.anchor}
          />
        </Row>,
      );
      return;
    }
    const src = day.sources.get(e.item.id);
    rows.push(
      <Row key={`i${e.item.id}${e.time}`} hour={formatClock(e.time)}>
        {e.length ? (
          <Block item={e.item} src={src} day={day} on={on} selected={selected === e.item.id} />
        ) : (
          <ThinItem item={e.item} src={src} day={day} on={on} selected={selected === e.item.id} />
        )}
      </Row>,
    );
  });
  return (
    <View aria-label="Schedule" style={{ paddingTop: s.s3, paddingRight: s.s4 }}>
      {rows}
    </View>
  );
}

function Row({ hour, children }: { hour: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ width: HOURS, paddingTop: s.s3, paddingRight: s.s3, alignItems: "flex-end" }}>
        {hour ? (
          <T s="small" tone="ink3" tnum>
            {hour}
          </T>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

function useRegister(task: TaskView | null) {
  useEffect(() => {
    if (!task) return;
    rowRegistry.set(task._id, task);
    return () => {
      rowRegistry.delete(task._id);
    };
  }, [task]);
}

/** A task's checkbox: ticks it with Undo, or takes the tick back. */
function TaskBox({ task, size = 20 }: { task: TaskView; size?: number }) {
  const isTicking = ticking.useValue((t) => Boolean(t[task._id]));
  const done = task.done || isTicking;
  return (
    <SpaceBox
      color={task.color}
      done={done}
      size={size}
      disabled={task.projected}
      label={`${done ? "Mark not done" : "Complete"}: ${task.title}`}
      onPress={() => {
        if (task.done) {
          if (!task.repeat) reopenTask(task._id);
        } else if (!isTicking) completeTask(task);
      }}
    />
  );
}

const Block = memo(function Block({
  item,
  src,
  day,
  on,
  selected,
}: {
  item: DayItem;
  src: Source | undefined;
  day: Day;
  on: BlockHandlers;
  selected: boolean;
}) {
  const task = src?.type === "task" ? src.task : null;
  const routine = src?.type === "routine" ? src.routine : null;
  useRegister(task);
  const isTicking = ticking.useValue((t) => Boolean(task && t[task._id]));
  const color = task?.color ?? routine?.color ?? null;
  const tone = spaceTone(color);
  const length = item.length ?? 0;
  const done = item.done || isTicking;
  const live = isLive(item, day.now);
  const past = day.now !== null && (item.time ?? 0) + length <= day.now;
  const block = isSpaceBlock(item);
  const prep = task ? prepForOf(task) : null;
  const range = `${formatClock(item.time ?? 0)}–${formatClock((item.time ?? 0) + length)}`;
  const bits = [range];
  if (item.spaceName && day.settings.showSpace && showsSpaceName(item.title, item.spaceName))
    bits.push(item.spaceName);
  if (prep?.daysLeft)
    bits.push(
      `${prep.title.replace(/ \d+$/, "")} in ${prep.daysLeft} ${prep.daysLeft === 1 ? "day" : "days"}`,
    );
  if (task?.deadline && !task.event)
    bits.push(
      `due ${task.deadline === day.day ? (task.dueTime !== null ? formatClock(task.dueTime) : "today") : dueDayWord(task.deadline, day.day)}`,
    );
  if (task?.proposedBy) bits.push(`suggested by ${task.proposedBy}`);
  const icon = routine ? (
    <SpaceBox shape="ring" color={color} done={done} label={`Open ${item.title}`} />
  ) : task?.proposedBy ? (
    <Icon icon={Sparkles} size={20} tone="parse" />
  ) : block ? (
    <Icon icon={CalendarRange} size={20} color={tone.dotHex} strokeWidth={2} />
  ) : task?.event ? (
    <Icon
      icon={Calendar}
      size={20}
      color={day.settings.showSpace && color ? tone.dotHex : hex.ink3}
      strokeWidth={2}
    />
  ) : task ? (
    <TaskBox task={task} />
  ) : null;
  const right = live ? (
    <Pill kind="now" text="Now" />
  ) : routine && done ? (
    <Pill kind="streak" text={`${routine.streak} days`} />
  ) : task?.proposedBy ? (
    <Pill kind="sug" text="Suggested" />
  ) : null;
  return (
    <Press
      testID={`task-${item.id}`}
      role="button"
      accessibilityLabel={`Open ${item.title}, ${range}`}
      onPress={() => on.open(item.id)}
      hoverBg={null}
      scale={false}
      style={({ hovered }) => ({
        minHeight: blockHeight(length),
        marginVertical: s.s1,
        paddingTop: s.s3,
        paddingBottom: s.s3,
        paddingHorizontal: s.s4,
        borderRadius: r.box,
        overflow: "hidden",
        backgroundColor: task?.proposedBy ? "transparent" : color ? tone.surface : c.sunken,
        borderWidth: task?.proposedBy ? 2 : selected ? 2 : 0,
        borderStyle: task?.proposedBy ? "dashed" : "solid",
        borderColor: task?.proposedBy ? c.parse : c.ink,
        opacity: done ? 0.6 : past ? 0.8 : hovered ? 0.92 : 1,
      })}
    >
      {live && day.now !== null ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${((day.now - (item.time ?? 0)) / length) * 100}%`,
            height: 2,
            backgroundColor: c.now,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: -1,
              top: -3,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: c.now,
            }}
          />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3 }}>
        {icon}
        <T s="title" lines={1} strike={done} tone={done ? "ink2" : "ink"} extra={{ flex: 1 }}>
          {item.title}
        </T>
        {right}
      </View>
      <T s="small" tone="ink2" tnum extra={{ marginTop: 2 }}>
        {bits.join(", ")}
      </T>
      {routine ? <RoutineParts routine={routine} color={color} on={on} /> : null}
      {task?.event && !block ? <InClass tasks={day.inClass.get(item.id) ?? []} color={color} /> : null}
      {block && task?.spaceId ? <NextInSpace spaceId={task.spaceId} /> : null}
    </Press>
  );
});

/** A routine's parts as small round chips; ticking one checks its habit too (contract A). */
function RoutineParts({
  routine,
  color,
  on,
}: {
  routine: RoutineView;
  color: RoutineView["color"];
  on: BlockHandlers;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s2 }}>
      {routine.parts.map((p) => (
        <MiniChip
          key={p.index}
          round
          color={color}
          done={p.done}
          title={p.title}
          note={p.length && p.length >= 10 ? formatSpan(p.length) : null}
          label={`${p.done ? "Not done yet" : "Done"}: ${p.title}`}
          onPress={() => on.tickRoutinePart(routine, p.index, !p.done)}
        />
      ))}
    </View>
  );
}

/** What's due during a class, ticked from the class itself. */
function InClass({ tasks, color }: { tasks: TaskView[]; color: TaskView["color"] }) {
  if (!tasks.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s2 }}>
      {tasks.map((t) => (
        <InClassChip key={t._id} task={t} color={color} />
      ))}
    </View>
  );
}

function InClassChip({ task, color }: { task: TaskView; color: TaskView["color"] }) {
  const isTicking = ticking.useValue((t) => Boolean(t[task._id]));
  const done = task.done || isTicking;
  return (
    <MiniChip
      color={color}
      done={done}
      title={task.title}
      note="due in class"
      label={`${done ? "Mark not done" : "Complete"}: ${task.title}`}
      checkbox
      onPress={() => (task.done ? reopenTask(task._id) : !isTicking && completeTask(task))}
    />
  );
}

function MiniChip({
  round,
  color,
  done,
  title,
  note,
  label,
  onPress,
  checkbox,
}: {
  round?: boolean;
  color: TaskView["color"];
  done: boolean;
  title: string;
  note: string | null;
  label: string;
  onPress: () => void;
  checkbox?: boolean;
}) {
  const tone = spaceTone(color);
  const phone = useIsPhone();
  return (
    <Press
      role={checkbox ? "checkbox" : "switch"}
      aria-checked={done}
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        height: 32,
        paddingLeft: s.s2,
        paddingRight: s.s3,
        borderRadius: r.pill,
        backgroundColor: c.bg,
        // Smaller than a row, so on touch it grows its target without growing its look.
        ...(phone ? { marginVertical: 0 } : null),
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: round ? 9 : 5,
          borderWidth: 2,
          borderColor: tone.dot,
          backgroundColor: done ? tone.dot : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {done ? <CheckGlyph size={11} color={hex.bg} strokeWidth={3.5} /> : null}
      </View>
      <Txt
        style={[
          ty.small,
          { color: done ? c.ink2 : c.ink },
          done ? { textDecorationLine: "line-through" } : null,
        ]}
      >
        {title}
      </Txt>
      {note ? <Txt style={[ty.small, { color: c.ink3 }]}>{note}</Txt> : null}
    </Press>
  );
}

/** A space's time block names what's next in that space. */
function NextInSpace({ spaceId }: { spaceId: string }) {
  const view = useSpaceView(spaceId as TaskView["spaceId"] & string);
  const next = view ? [...view.next, ...view.later].find((t) => !t.event) : null;
  if (!next) return null;
  return (
    <T s="small" tone="ink2" lines={1} extra={{ marginTop: s.s2 }}>
      {`Next: ${next.title}`}
    </T>
  );
}

function ThinItem({
  item,
  src,
  day,
  on,
  selected,
}: {
  item: DayItem;
  src: Source | undefined;
  day: Day;
  on: BlockHandlers;
  selected: boolean;
}) {
  const task = src?.type === "task" ? src.task : null;
  useRegister(task);
  const past = day.now !== null && (item.time ?? 0) < day.now;
  const label =
    item.spaceName && day.settings.showSpace && showsSpaceName(item.title, item.spaceName)
      ? item.spaceName
      : null;
  return (
    <Thin
      icon={
        task?.proposedBy ? (
          <Icon icon={Sparkles} size={20} tone="parse" />
        ) : task?.event ? (
          <Icon
            icon={Calendar}
            size={20}
            color={task.color ? spaceTone(task.color).dotHex : hex.ink3}
            strokeWidth={2}
          />
        ) : task ? (
          <TaskBox task={task} size={18} />
        ) : null
      }
      title={item.title}
      space={label}
      done={item.done}
      past={past}
      right={task?.reminders.length ? "bell" : undefined}
      label={`Open ${item.title}, ${formatClock(item.time ?? 0)}`}
      onPress={() => on.open(item.id)}
      testID={`task-${item.id}`}
      selected={selected}
    />
  );
}

/** A thin row: Wake up, Review today, Wind down, and anything with a time but no length. */
function Thin({
  icon,
  title,
  space,
  done,
  past,
  pill,
  right,
  label,
  onPress,
  testID,
  selected,
}: {
  icon: ReactNode;
  title: string;
  space?: string | null;
  done?: boolean;
  past?: boolean;
  pill?: string;
  right?: string;
  label: string;
  onPress: () => void;
  testID?: string;
  selected?: boolean;
}) {
  return (
    <Press
      testID={testID}
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      scale={false}
      style={{
        minHeight: 40,
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        paddingHorizontal: s.s4,
        borderRadius: r.card,
        backgroundColor: selected ? c.select : "transparent",
      }}
    >
      <View style={{ width: 20, alignItems: "center" }}>{icon}</View>
      <Txt
        numberOfLines={1}
        style={[
          ty.body,
          { flex: 1, color: past && !pill ? c.ink3 : c.ink2 },
          done ? { textDecorationLine: "line-through" } : null,
        ]}
      >
        {title}
        {space ? <Txt style={[ty.small, { color: c.ink3 }]}>{`  ${space}`}</Txt> : null}
      </Txt>
      {pill ? <Pill kind="now" text={pill} /> : null}
      {right && right !== "bell" ? (
        <T s="small" tone="ink3" tnum>
          {right}
        </T>
      ) : null}
    </Press>
  );
}

/** A free stretch: "1 h 45 free", or in red "Now, 2 h 50 free until 13:30". Tapping it opens Fill. */
function Gap({ from, to, now, onPress }: { from: number; to: number; now: boolean; onPress: () => void }) {
  const span = formatSpan(to - from);
  const text = now ? `Now, ${span} free until ${formatClock(to)}` : `${span} free`;
  return (
    <Press
      role="button"
      accessibilityLabel={`${text}. Fill ${formatClock(from)}–${formatClock(to)}`}
      onPress={onPress}
      scale={false}
      hoverBg={null}
      style={({ hovered }) => ({
        minHeight: 40,
        marginVertical: s.s1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: s.s4,
        borderRadius: r.card,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: now ? c.now : hovered ? c.ink3 : c.lineStrong,
      })}
    >
      <Txt style={[ty.body, { color: now ? c.now : c.ink3 }]}>
        {now ? (
          <>
            <Txt style={[ty.body, family("600"), { color: c.now }]}>Now</Txt>
            {`, ${span} free until ${formatClock(to)}`}
          </>
        ) : (
          <>
            <Txt style={[ty.body, family("600"), { color: c.ink2 }]}>{span}</Txt>
            {" free"}
          </>
        )}
      </Txt>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: c.sunken,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon icon={Plus} size={14} tone="ink3" strokeWidth={2.5} />
      </View>
    </Press>
  );
}

// One task in a list: the checkbox in its space's colour, the title, a quiet line of facts
// (when, due, repeat, reminders, note) and its length. Tap opens it; tick completes it.

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Bell, Bot, Cake, CalendarDays, Flag, NotebookText, Repeat2, Sunrise } from "lucide-react-native";
import { addDays } from "@kriyan/core/dates";
import { formatDay, formatDuration, formatTimeRange } from "@kriyan/core/format";
import type { TaskView } from "@/data/views";
import { selection } from "@/features/shell/context";
import { rowRegistry } from "@/features/shell/rows";
import { useControl, useIsPhone } from "@/theme/layout";
import { c, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Check, Dot } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { completeTask, moveTasks, reopenTask, ticking } from "./actions";
import { DayPicker } from "./pickers";
import { SwipeRow } from "./SwipeRow";

export function openTask(id: string) {
  router.push(`/task/${id}`);
}

interface Props {
  task: TaskView;
  today: string;
  /** Show the date and time (lists that span days: a space, the inbox). */
  showWhen?: boolean;
  /** Controls after the row (the inbox's Today, Pick a day, Move to space). */
  trailing?: ReactNode;
  /** Wraps the row for dragging onto the timeline. */
  wrap?: (row: ReactNode) => ReactNode;
  /** Offer moving it to another day: buttons on hover, a swipe on phones. */
  movable?: boolean;
}

function Fact({ icon, text }: { icon?: Parameters<typeof Icon>[0]["icon"]; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1 }}>
      {icon ? <Icon icon={icon} size={14} /> : null}
      <Txt variant="meta" tone="ink3" numberOfLines={1}>
        {text}
      </Txt>
    </View>
  );
}

export function facts(
  task: TaskView,
  today: string,
  showWhen: boolean,
): { icon?: Parameters<typeof Icon>[0]["icon"]; text: string }[] {
  const out: { icon?: Parameters<typeof Icon>[0]["icon"]; text: string }[] = [];
  // A yearly task (a birthday) says its day with a cake, once, whether or not the row shows when.
  const yearly = task.repeat?.freq === "year" && task.date !== null;
  if ((showWhen || yearly) && task.date) {
    const day = formatDay(task.date, today);
    out.push({
      ...(yearly ? { icon: Cake } : {}),
      text:
        showWhen && task.time !== null
          ? `${day}, ${formatTimeRange(task.time, task.length ?? undefined)}`
          : day,
    });
  }
  if (task.deadline) out.push({ icon: Flag, text: `Due ${formatDay(task.deadline, today)}` });
  if (!yearly && task.repeatText) out.push({ icon: Repeat2, text: task.repeatText });
  if (task.reminders.length) out.push({ icon: Bell, text: String(task.reminders.length) });
  if (task.note) out.push({ icon: NotebookText, text: "Note" });
  if (task.proposedBy) out.push({ icon: Bot, text: `Proposed by ${task.proposedBy}` });
  return out;
}

export const TaskRow = memo(function TaskRow({
  task,
  today,
  showWhen = false,
  trailing,
  wrap,
  movable = false,
}: Props) {
  const phone = useIsPhone();
  const { row } = useControl();
  const isTicking = ticking.useValue((t) => Boolean(t[task._id]));
  const selected = selection.useValue((st) => st.taskId === task._id);
  const done = task.done || isTicking;
  const tone = spaceTone(task.color);
  const info = facts(task, today, showWhen);
  const [picking, setPicking] = useState(false);
  // A Pressable's hover ends over the controls inside it (the title is one), so the row tracks
  // the mouse itself.
  const [hovered, setHovered] = useState(false);
  const pickRef = useRef<View>(null);
  // Something from an earlier day, or due today with no day yet, comes to today; anything
  // else goes to tomorrow.
  const target = !task.date || task.date < today ? today : addDays(today, 1);
  const targetLabel = target === today ? "Today" : "Tomorrow";
  const canMove = movable && !task.done && !task.projected && !task.event;
  useEffect(() => {
    rowRegistry.set(task._id, task);
    return () => {
      rowRegistry.delete(task._id);
    };
  }, [task]);

  const onTick = () => {
    if (task.done) {
      if (!task.repeat) reopenTask(task._id);
      return;
    }
    if (!isTicking) completeTask(task);
  };

  const body = (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s3 }}>
      <View style={{ marginTop: phone ? 11 : 1 }}>
        {task.event ? (
          <View
            style={{
              width: phone ? 22 : 18,
              height: phone ? 22 : 18,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Dot color={tone.dot} />
          </View>
        ) : (
          <Check
            color={task.color ? tone.dot : c.ink3}
            done={done}
            onPress={onTick}
            disabled={task.projected}
            label={`${done ? "Mark not done" : "Complete"}: ${task.title}`}
          />
        )}
      </View>
      <Press
        role="button"
        accessibilityLabel={`Open ${task.title}`}
        onPress={() => {
          // The row stays selected after its panel closes, so X, D, M and Delete act on it.
          selection.set({ taskId: task._id });
          openTask(task._id);
        }}
        hoverBg={null}
        scale={false}
        style={{ flex: 1, minWidth: 0, minHeight: phone ? 44 : 24, justifyContent: "center", gap: 2 }}
      >
        <Txt variant="body" tone={done ? "ink3" : "ink"} strike={done}>
          {task.title}
        </Txt>
        {info.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: s.s3, rowGap: 2 }}>
            {info.map((f, i) => (
              <Fact key={i} icon={f.icon} text={f.text} />
            ))}
          </View>
        ) : null}
      </Press>
      {/* A shown time range already says how long; a day alone doesn't. */}
      {task.length && !(showWhen && task.date && task.time !== null) ? (
        <Txt variant="meta" tone="ink3" tnum style={{ marginTop: phone ? 12 : 4 }}>
          {formatDuration(task.length)}
        </Txt>
      ) : null}
      {trailing}
    </View>
  );

  const picker = canMove ? (
    <Popover open={picking} onClose={() => setPicking(false)} anchor={pickRef} title="Move to a day">
      <DayPicker
        value={task.date}
        today={today}
        allowNone={false}
        onPick={(date) => {
          setPicking(false);
          if (date && date !== task.date) void moveTasks([task], date);
        }}
      />
    </Popover>
  ) : null;

  const hover = (e: { nativeEvent: { pointerType?: string } }, on: boolean) => {
    if (e.nativeEvent.pointerType === "mouse") setHovered(on);
  };
  const rowPress = (
    <Press
      testID={`task-${task._id}`}
      hoverBg={null}
      scale={false}
      ripple={false}
      focusable={false}
      accessible={false}
      onPointerEnter={(e) => hover(e, true)}
      onPointerLeave={(e) => hover(e, false)}
      style={{
        minHeight: row,
        justifyContent: "center",
        paddingVertical: phone ? s.s1 : s.s2,
        paddingHorizontal: s.s2,
        marginHorizontal: -s.s2,
        borderRadius: r.ctl,
        backgroundColor: selected ? c.select : hovered ? c.hover : "transparent",
      }}
    >
      {wrap ? wrap(body) : body}
      {canMove && !phone && !isTicking && (hovered || picking) ? (
        // Over the row's end, in the row's hover colour, so nothing beneath shifts.
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: s.s1,
            paddingLeft: s.s4,
            paddingRight: s.s1,
            borderRadius: r.ctl,
            backgroundColor: selected ? c.select : c.hover,
          }}
        >
          <Button icon={Sunrise} label={targetLabel} onPress={() => void moveTasks([task], target)} />
          <Button
            ref={pickRef}
            icon={CalendarDays}
            accessibilityLabel="Pick a day"
            onPress={() => setPicking(true)}
          />
        </View>
      ) : null}
    </Press>
  );

  if (!canMove) return rowPress;
  return (
    <>
      {phone ? (
        <SwipeRow
          color={task.color ? tone.dot : c.ink3}
          onComplete={task.event || isTicking ? undefined : onTick}
          moveLabel={targetLabel}
          onMove={() => void moveTasks([task], target)}
          onPick={() => setPicking(true)}
        >
          {rowPress}
        </SwipeRow>
      ) : (
        rowPress
      )}
      {picker}
    </>
  );
});

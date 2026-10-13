// One task in a list: the checkbox in its space's colour, the title, a quiet line of facts
// (when, due, repeat, reminders, note) and its length. Tap opens it; tick completes it.

import { memo, useEffect, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import { Bell, Bot, Cake, Flag, NotebookText, Repeat2 } from "lucide-react-native";
import { formatDay, formatDuration, formatTimeRange } from "@kriyan/core/format";
import type { TaskView } from "@/data/views";
import { selection } from "@/features/shell/context";
import { rowRegistry } from "@/features/shell/rows";
import { useControl, useIsPhone } from "@/theme/layout";
import { c, r, s, spaceTone } from "@/theme/tokens";
import { Check, Dot } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { completeTask, reopenTask, ticking } from "./actions";

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

export function facts(task: TaskView, today: string, showWhen: boolean): { icon?: Parameters<typeof Icon>[0]["icon"]; text: string }[] {
  const out: { icon?: Parameters<typeof Icon>[0]["icon"]; text: string }[] = [];
  if (showWhen && task.date) {
    const day = formatDay(task.date, today);
    out.push({ text: task.time !== null ? `${day}, ${formatTimeRange(task.time, task.length ?? undefined)}` : day });
  }
  if (task.deadline) out.push({ icon: Flag, text: `Due ${formatDay(task.deadline, today)}` });
  if (task.repeat?.freq === "year" && task.date) out.push({ icon: Cake, text: formatDay(task.date, today) });
  else if (task.repeatText) out.push({ icon: Repeat2, text: task.repeatText });
  if (task.reminders.length) out.push({ icon: Bell, text: String(task.reminders.length) });
  if (task.note) out.push({ icon: NotebookText, text: "Note" });
  if (task.proposedBy) out.push({ icon: Bot, text: `Proposed by ${task.proposedBy}` });
  return out;
}

export const TaskRow = memo(function TaskRow({ task, today, showWhen = false, trailing, wrap }: Props) {
  const phone = useIsPhone();
  const { row } = useControl();
  const isTicking = ticking.useValue((t) => Boolean(t[task._id]));
  const selected = selection.useValue((st) => st.taskId === task._id);
  const done = task.done || isTicking;
  const tone = spaceTone(task.color);
  const info = facts(task, today, showWhen);
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
          <View style={{ width: phone ? 22 : 18, height: phone ? 22 : 18, alignItems: "center", justifyContent: "center" }}>
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
        onPress={() => openTask(task._id)}
        hoverBg={null}
        scale={false}
        unstable_pressDelay={Platform.OS === "web" ? 0 : 100}
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
      {task.length && !showWhen ? (
        <Txt variant="meta" tone="ink3" tnum style={{ marginTop: phone ? 12 : 4 }}>
          {formatDuration(task.length)}
        </Txt>
      ) : null}
      {trailing}
    </View>
  );

  return (
    <Press
      testID={`task-${task._id}`}
      hoverBg={selected ? c.select : c.hover}
      scale={false}
      ripple={false}
      focusable={false}
      accessible={false}
      style={{
        minHeight: row,
        justifyContent: "center",
        paddingVertical: phone ? s.s1 : s.s2,
        paddingHorizontal: s.s2,
        marginHorizontal: -s.s2,
        borderRadius: r.ctl,
        backgroundColor: selected ? c.select : "transparent",
      }}
    >
      {wrap ? wrap(body) : body}
    </Press>
  );
});

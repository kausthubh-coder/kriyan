// A task in v5's row style (docs/design/v5 prototype `.r`): a checkbox in its space's colour
// (an event gets a calendar), the title with its space's name in grey after it, and one thing
// on the right, with small repeat and reminder glyphs before it. Tapping the row opens the task.
// The lists off Today use it: the Inbox, a space, Goals and habits.

import { useEffect } from "react";
import { View } from "react-native";
import { Bell, CalendarDays, Check as CheckGlyph, Repeat2 } from "lucide-react-native";
import type { TaskView } from "@/data/views";
import { completeTask, reopenTask, ticking } from "@/features/tasks/actions";
import { openTask } from "@/features/tasks/TaskRow";
import { useIsPhone } from "@/theme/layout";
import { c, family, hex, r, s, spaceTone } from "@/theme/tokens";
import { DottedRule } from "@/ui/DottedRule";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { selection } from "./context";
import { rowRegistry } from "./rows";

/** The row's height: Joi's 70 on phones, 60 with a mouse. */
export function useRowHeight(): number {
  return useIsPhone() ? 70 : 60;
}

const BOX = 20;

export function ListRow({
  task,
  meta,
  showSpace = true,
}: {
  task: TaskView;
  /** The one thing on the right: "Due 23:59", "15:00–16:15", "Was Wed 14 Oct". */
  meta?: string;
  /** The space's name after the title; off inside that space. */
  showSpace?: boolean;
}) {
  const height = useRowHeight();
  const phone = useIsPhone();
  const isTicking = ticking.useValue((t) => Boolean(t[task._id]));
  const selected = selection.useValue((st) => st.taskId === task._id);
  const done = task.done || isTicking;
  const tone = spaceTone(task.color);
  const space = showSpace && task.spacePath ? task.spacePath.split(" / ").at(-1) : null;
  // Shortcuts (X, Delete) act on the selected row through the registry, as on Today.
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
  return (
    <View
      testID={`task-${task._id}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s4,
        minHeight: height,
        backgroundColor: selected && !phone ? c.select : undefined,
        borderRadius: selected && !phone ? r.card : 0,
        marginHorizontal: selected && !phone ? -s.s3 : 0,
        paddingHorizontal: selected && !phone ? s.s3 : 0,
      }}
    >
      {task.event ? (
        <View style={{ width: BOX + 4, alignItems: "center" }}>
          <Icon icon={CalendarDays} size={20} color={tone.dotHex} strokeWidth={2} />
        </View>
      ) : task.projected ? (
        // A later date of a repeat: drawn like the others, ticked off on its own day.
        <View style={{ width: 24, alignItems: "center" }}>
          <View
            style={{
              width: BOX,
              height: BOX,
              borderRadius: r.sm,
              borderWidth: 2,
              borderColor: task.color ? tone.dot : c.ink3,
            }}
          />
        </View>
      ) : (
        <Press
          role="checkbox"
          aria-checked={done}
          accessibilityLabel={`${done ? "Mark not done" : "Complete"}: ${task.title}`}
          onPress={onTick}
          hoverBg={null}
          rippleRadius={22}
          style={{ width: 44, height: 44, margin: -10, alignItems: "center", justifyContent: "center" }}
        >
          {({ hovered }) => (
            <View
              style={{
                width: BOX,
                height: BOX,
                borderRadius: r.sm,
                borderWidth: 2,
                borderColor: done ? c.lineStrong : task.color ? tone.dot : c.ink3,
                backgroundColor: done ? c.lineStrong : hovered ? c.hover : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {done ? <CheckGlyph size={12} color={hex.bg} strokeWidth={3} /> : null}
            </View>
          )}
        </Press>
      )}
      <Press
        role="button"
        accessibilityLabel={`Open ${task.title}`}
        onPress={() => {
          selection.set({ taskId: task._id });
          openTask(task._id);
        }}
        hoverBg={null}
        scale={false}
        style={{
          flex: 1,
          minWidth: 0,
          alignSelf: "stretch",
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
        }}
      >
        {({ hovered }) => (
          <>
            <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: s.s2 }}>
              <Txt
                variant="subhead"
                tone={done ? "ink3" : task.proposedBy ? "ink2" : "ink"}
                numberOfLines={1}
                style={[
                  family("500"),
                  { flexShrink: 1 },
                  hovered && !phone
                    ? { textDecorationLine: "underline", textDecorationColor: c.lineStrong }
                    : null,
                ]}
              >
                {task.title}
              </Txt>
              {space ? (
                <Txt
                  variant="label"
                  tone="ink3"
                  numberOfLines={1}
                  style={{ flexShrink: 2, fontSize: 14, lineHeight: 20 }}
                >
                  {space}
                </Txt>
              ) : null}
            </View>
            {task.repeat || task.reminders.length || meta ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1, flexShrink: 0 }}>
                {task.repeat ? <Icon icon={Repeat2} size={15} tone="ink3" /> : null}
                {task.reminders.length && task.time !== null ? (
                  <Icon icon={Bell} size={14} tone="ink3" />
                ) : null}
                {meta ? (
                  <Txt variant="body" tone="ink3" tnum numberOfLines={1}>
                    {meta}
                  </Txt>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </Press>
      <DottedRule width={2} />
    </View>
  );
}

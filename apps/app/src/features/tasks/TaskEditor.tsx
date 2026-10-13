// One editor for every task. Order: title, space, when (date, time, optional length),
// repeat, reminders, deadline, goal, note. Empty fields are quiet "Add" rows, so a simple
// task stays short. Every change saves at once.
//
// Desktop: sub-editors open beside the panel. Phones: they replace the sheet's content
// (never a sheet on a sheet), with Back to return.

import { useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useMutation } from "convex/react";
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  CircleDot,
  Clock,
  Ellipsis,
  Flag,
  Hourglass,
  Layers,
  Repeat2,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { formatDay, formatDuration, formatTimeRange, describeReminder, describeRepeat } from "@kriyan/core/format";
import { parseTask } from "@kriyan/core/parse";
import { firstOccurrence } from "@kriyan/core/parse";
import type { Reminder } from "@kriyan/core/reminders";
import type { Repeat } from "@kriyan/core/repeat";
import { useClock } from "@/data/time";
import { useProgressView, useSpaces, type TaskDoc } from "@/data/views";
import { ensureNotifications } from "@/features/notifications/register";
import { NoteEditor } from "@/features/notes/NoteEditor";
import { useControl, useIsPhone, useType } from "@/theme/layout";
import { c, hex, r, s, spaceTone } from "@/theme/tokens";
import { AutoInput } from "@/ui/AutoInput";
import { Button } from "@/ui/Button";
import { Check, Chip, Dot, Field } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { completeTask, deleteTask, errorText, reopenTask, ticking } from "./actions";
import { DayPicker, Option, SpacePicker } from "./pickers";
import { ReminderEditor } from "./ReminderEditor";
import { RepeatEditor } from "./RepeatEditor";
import { showToast } from "@/ui/toast";

type Sub = "space" | "when" | "repeat" | "reminders" | "deadline" | "goal" | "more";

interface Props {
  task: TaskDoc;
  onClose: () => void;
}

export function TaskEditor({ task, onClose }: Props) {
  const phone = useIsPhone();
  const roles = useType();
  const { today } = useClock();
  const spaces = useSpaces();
  const update = useMutation(api.tasks.update);
  const [sub, setSub] = useState<Sub | null>(null);
  const anchors = {
    space: useRef<View>(null),
    when: useRef<View>(null),
    repeat: useRef<View>(null),
    reminders: useRef<View>(null),
    deadline: useRef<View>(null),
    goal: useRef<View>(null),
    more: useRef<View>(null),
  };
  const [title, setTitle] = useState(task.title);
  const isTicking = ticking.useValue((t) => Boolean(t[task._id]));
  const done = task.doneAt !== undefined || isTicking;
  const space = spaces?.find((sp) => sp._id === task.spaceId);
  const tone = spaceTone(space?.color ?? null);

  const save = (patch: Omit<Parameters<typeof update>[0], "id">) =>
    update({ id: task._id, ...patch }).catch((e: unknown) => showToast(errorText(e)));

  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) void save({ title: t });
    else setTitle(task.title);
  };

  const when = task.date
    ? `${formatDay(task.date, today)}${task.time !== undefined ? `, ${formatTimeRange(task.time, task.length)}` : task.length ? `, ${formatDuration(task.length)}` : ""}`
    : task.length
      ? formatDuration(task.length)
      : null;

  const subEditor = (which: Sub): { title: string; body: ReactNode; width?: number } | null => {
    switch (which) {
      case "space":
        return {
          title: "Space",
          body: (
            <SpacePicker
              value={task.spaceId ?? null}
              onPick={(id) => {
                setSub(null);
                void save({ spaceId: (id as Id<"spaces"> | null) ?? null });
              }}
            />
          ),
        };
      case "when":
        return { title: "When", body: <WhenEditor task={task} today={today} save={save} onDone={() => setSub(null)} />, width: 340 };
      case "repeat":
        return {
          title: "Repeat",
          width: 384,
          body: (
            <RepeatEditor
              rule={(task.repeat as Repeat | undefined) ?? null}
              first={task.repeatFirst ?? task.date ?? today}
              time={task.time ?? null}
              length={task.length ?? null}
              today={today}
              onCancel={() => setSub(null)}
              onSave={(rule) => {
                setSub(null);
                if (rule && !task.date) void save({ repeat: rule, date: firstOccurrence(rule, today) });
                else void save({ repeat: rule });
              }}
            />
          ),
        };
      case "reminders":
        return {
          title: "Reminders",
          width: 340,
          body: (
            <ReminderEditor
              reminders={task.reminders as Reminder[]}
              timed={task.time !== undefined}
              onChange={(next) => {
                if (next.length > task.reminders.length) void ensureNotifications();
                void save({ reminders: next, ...(task.date ? {} : { date: today }) });
              }}
            />
          ),
        };
      case "deadline":
        return {
          title: "Deadline",
          body: (
            <DayPicker
              value={task.deadline ?? null}
              today={today}
              onPick={(date) => {
                setSub(null);
                void save({ deadline: date });
              }}
            />
          ),
        };
      case "goal":
        return { title: "Goal", body: <GoalPicker value={task.goalId ?? null} onPick={(id) => (setSub(null), void save({ goalId: id }))} /> };
      case "more":
        return {
          title: "Task",
          body: (
            <View style={{ gap: 2 }}>
              <Option
                label={task.event ? "Make it a task to tick off" : "Make it an event you attend"}
                leading={<Icon icon={CircleDot} size={16} />}
                onPress={() => {
                  setSub(null);
                  void save({ event: !task.event });
                }}
              />
              <Option
                label="Delete task"
                leading={<Icon icon={Trash2} size={16} />}
                onPress={() => {
                  setSub(null);
                  deleteTask({ _id: task._id, title: task.title }, onClose);
                }}
              />
            </View>
          ),
        };
    }
    return null;
  };

  // Phones: a sub-editor takes over the sheet.
  const open = sub ? subEditor(sub) : null;
  if (phone && open && sub !== "more") {
    return (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: s.s4, paddingTop: s.s2, gap: s.s4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1, marginLeft: -s.s3 }}>
          <Button icon={ArrowLeft} accessibilityLabel="Back to the task" onPress={() => setSub(null)} />
          <Txt variant="subhead" heading={2} style={{ flex: 1 }}>
            {open.title}
          </Txt>
        </View>
        {open.body}
      </ScrollView>
    );
  }

  const row = (which: Exclude<Sub, "more">, icon: LucideIcon, label: string, value: string | null, empty: string, extra?: ReactNode) => (
    <Prop key={which} icon={icon} label={label}>
      <View ref={anchors[which]} collapsable={false}>
        <ValueButton text={value ?? empty} empty={!value} expanded={sub === which} onPress={() => setSub(sub === which ? null : which)} leading={extra} label={`${label}: ${value ?? empty}`} />
      </View>
    </Prop>
  );

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1, height: phone ? 52 : 56, paddingLeft: phone ? s.s4 : s.s6, paddingRight: phone ? s.s1 : s.s3 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: s.s2, minWidth: 0 }}>
          {space ? <Dot color={tone.dot} /> : null}
          <Txt variant="meta" tone="ink3" numberOfLines={1}>
            {space ? space.path.split(" / ").join(" / ") : "Inbox"}
          </Txt>
        </View>
        <View ref={anchors.more} collapsable={false}>
          <Button icon={Ellipsis} accessibilityLabel="More" expanded={sub === "more"} onPress={() => setSub(sub === "more" ? null : "more")} />
        </View>
        <Button icon={X} accessibilityLabel="Close" onPress={onClose} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: phone ? s.s4 : s.s6, paddingTop: s.s2, paddingBottom: s.s16, gap: s.s6 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s3 }}>
          <View style={{ paddingTop: 4 }}>
            {task.event ? (
              <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                <Dot color={tone.dot} size={10} />
              </View>
            ) : (
              <Check
                size={20}
                color={space ? tone.dot : c.ink3}
                done={done}
                label={`${done ? "Mark not done" : "Complete"}: ${task.title}`}
                onPress={() => (task.doneAt !== undefined ? reopenTask(task._id) : !isTicking && completeTask(task))}
              />
            )}
          </View>
          <AutoInput
            value={title}
            onChangeText={setTitle}
            onBlur={saveTitle}
            onSubmitEditing={saveTitle}
            submitBehavior="blurAndSubmit"
            accessibilityLabel="Title"
            placeholderTextColor={hex.ink3}
            lineHeight={roles.title.lineHeight ?? 28}
            style={[roles.title, { flex: 1, color: done ? c.ink3 : c.ink }]}
          />
        </View>

        <View>
          {row("space", Layers, "Space", space?.path ?? null, "Add to a space", space ? <Dot color={tone.dot} /> : undefined)}
          {row("when", Clock, "When", when, "Add a date")}
          {row("repeat", Repeat2, "Repeat", task.repeat ? describeRepeat(task.repeat as Repeat, task.repeatFirst ?? task.date ?? today, today) : null, "Add repeat")}
          <Prop icon={Bell} label="Reminders">
            <View ref={anchors.reminders} collapsable={false}>
              {(task.reminders as Reminder[]).map((rem, i) => (
                <ValueButton
                  key={i}
                  text={describeReminder(rem)}
                  label={`Reminder: ${describeReminder(rem)}. Edit reminders`}
                  onPress={() => setSub("reminders")}
                  trailing={
                    <Press
                      role="button"
                      accessibilityLabel={`Remove reminder: ${describeReminder(rem)}`}
                      onPress={() => void save({ reminders: (task.reminders as Reminder[]).filter((_, k) => k !== i) })}
                      hoverBg={c.select}
                      style={{ width: 28, height: 28, borderRadius: r.sm, alignItems: "center", justifyContent: "center", marginLeft: "auto" }}
                    >
                      <Icon icon={X} size={14} />
                    </Press>
                  }
                />
              ))}
              <ValueButton text="Add reminder" empty expanded={sub === "reminders"} onPress={() => setSub(sub === "reminders" ? null : "reminders")} />
            </View>
          </Prop>
          {row("deadline", Flag, "Deadline", task.deadline ? `Due ${formatDay(task.deadline, today)}` : null, "Add deadline")}
          <GoalRow task={task} anchor={anchors.goal} expanded={sub === "goal"} onPress={() => setSub(sub === "goal" ? null : "goal")} />
        </View>

        <View style={{ height: 1, backgroundColor: c.line }} />
        <NoteEditor key={task._id} value={task.note ?? ""} onChange={(note) => void save({ note: note || null })} />
      </ScrollView>

      {!phone || sub === "more" ? (
        <Popover
          open={Boolean(open)}
          onClose={() => setSub(null)}
          anchor={sub ? anchors[sub] : undefined}
          side={sub === "more" ? "below" : "left"}
          title={open?.title ?? ""}
          width={open?.width ?? 320}
        >
          {open?.body}
        </Popover>
      ) : null}
    </>
  );
}

function Prop({ icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  const phone = useIsPhone();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ width: phone ? 112 : 120, height: phone ? 48 : 36, flexDirection: "row", alignItems: "center", gap: s.s2 }}>
        <Icon icon={icon} size={16} />
        <Txt variant="body" tone="ink3">
          {label}
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

function ValueButton({
  text,
  empty,
  expanded,
  onPress,
  leading,
  trailing,
  label,
}: {
  text: string;
  empty?: boolean;
  expanded?: boolean;
  onPress: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  label?: string;
}) {
  const phone = useIsPhone();
  return (
    <Press
      role="button"
      accessibilityLabel={label ?? text}
      aria-expanded={expanded}
      onPress={onPress}
      scale={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        minHeight: phone ? 48 : 36,
        paddingHorizontal: s.s2,
        marginLeft: -s.s2,
        borderRadius: r.ctl,
        backgroundColor: expanded ? c.select : "transparent",
      }}
    >
      {leading}
      <Txt variant="body" tone={empty ? "ink3" : "ink"} style={{ flexShrink: 1 }}>
        {text}
      </Txt>
      {trailing}
    </Press>
  );
}

function GoalRow({ task, anchor, expanded, onPress }: { task: TaskDoc; anchor: React.RefObject<View | null>; expanded: boolean; onPress: () => void }) {
  const progress = useProgressView();
  const goal = progress?.goals.find((g) => g._id === task.goalId);
  return (
    <Prop icon={Target} label="Goal">
      <View ref={anchor} collapsable={false}>
        <ValueButton text={goal?.title ?? "Add to a goal"} empty={!goal} expanded={expanded} onPress={onPress} />
      </View>
    </Prop>
  );
}

function GoalPicker({ value, onPick }: { value: string | null; onPick: (id: Id<"goals"> | null) => void }) {
  const progress = useProgressView();
  const goals = progress?.goals ?? [];
  return (
    <View style={{ gap: 2 }}>
      <Option label="No goal" selected={value === null} onPress={() => onPick(null)} />
      {goals.map((g) => (
        <Option key={g._id} label={g.title} selected={value === g._id} onPress={() => onPick(g._id)} leading={<Icon icon={Target} size={16} />} />
      ))}
      {progress && goals.length === 0 ? (
        <Txt variant="meta" tone="ink3" style={{ padding: s.s2 }}>
          You have no goals yet. Add one in Progress.
        </Txt>
      ) : null}
    </View>
  );
}

const LENGTHS = [15, 30, 45, 60, 90, 120];

function WhenEditor({
  task,
  today,
  save,
  onDone,
}: {
  task: TaskDoc;
  today: string;
  save: (patch: { date?: string | null; time?: number | null; length?: number | null }) => Promise<unknown>;
  onDone: () => void;
}) {
  const [timeText, setTimeText] = useState("");
  const [lengthText, setLengthText] = useState("");
  const typedTime = timeText.trim() ? parseTask(`x at ${timeText.trim()}`, today).time : undefined;
  const typedLength = lengthText.trim() ? parseTask(`x for ${lengthText.trim()}`, today).length : undefined;
  const times = [9 * 60, 12 * 60, 14 * 60, 17 * 60, 19 * 60];
  return (
    <View style={{ gap: s.s4 }}>
      <View style={{ gap: s.s2 }}>
        <Txt variant="caption" tone="ink3">
          Day
        </Txt>
        <DayPicker
          value={task.date ?? null}
          today={today}
          allowNone={!task.repeat}
          onPick={(date) => void save(date ? { date } : { date: null, time: null })}
        />
      </View>
      <View style={{ gap: s.s2 }}>
        <Txt variant="caption" tone="ink3">
          Time
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
          {times.map((m) => (
            <Chip key={m} label={formatTimeRange(m, undefined)} on={task.time === m} onPress={() => void save({ time: m, ...(task.date ? {} : { date: today }) })} />
          ))}
          <Chip label="No time" on={task.time === undefined} onPress={() => void save({ time: null })} />
        </View>
        <Field
          label="Time"
          value={timeText}
          onChangeText={setTimeText}
          placeholder="Type a time, like 14:30 or 2pm"
          onSubmitEditing={() => {
            if (typedTime !== undefined) {
              void save({ time: typedTime, ...(task.date ? {} : { date: today }) });
              setTimeText("");
            }
          }}
          trailing={
            timeText.trim() ? (
              <Txt variant="meta" tone="ink3">
                {typedTime !== undefined ? `Enter for ${formatTimeRange(typedTime, undefined)}` : "Not a time yet"}
              </Txt>
            ) : null
          }
        />
      </View>
      <View style={{ gap: s.s2 }}>
        <Txt variant="caption" tone="ink3">
          Length (optional)
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
          {LENGTHS.map((m) => (
            <Chip key={m} label={formatDuration(m)} on={task.length === m} onPress={() => void save({ length: m })} />
          ))}
          <Chip label="No length" on={task.length === undefined} onPress={() => void save({ length: null })} />
        </View>
        <Field
          label="Length"
          value={lengthText}
          onChangeText={setLengthText}
          placeholder="Type a length, like 1h45"
          onSubmitEditing={() => {
            if (typedLength !== undefined) {
              void save({ length: typedLength });
              setLengthText("");
            }
          }}
          trailing={
            lengthText.trim() ? (
              <Txt variant="meta" tone="ink3">
                {typedLength !== undefined ? `Enter for ${formatDuration(typedLength)}` : "Not a length yet"}
              </Txt>
            ) : null
          }
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Button variant="primary" label="Done" icon={CalendarClock} onPress={onDone} />
      </View>
    </View>
  );
}

export function TaskEditorSkeleton() {
  return (
    <View testID="skeleton" style={{ padding: s.s6, gap: s.s6 }}>
      <View style={{ height: 28, width: "70%", borderRadius: r.sm, backgroundColor: c.hover }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flexDirection: "row", gap: s.s4 }}>
          <View style={{ height: 14, width: 88, borderRadius: r.sm, backgroundColor: c.hover }} />
          <View style={{ height: 14, width: 140, borderRadius: r.sm, backgroundColor: c.hover }} />
        </View>
      ))}
    </View>
  );
}

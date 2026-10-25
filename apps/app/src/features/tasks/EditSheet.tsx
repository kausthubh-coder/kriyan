// Edit (docs/design/v5, `editSheet` and `picker`): the title and note, then one row per field,
// each opening its own small picker over the page: Day, Time and length, Due, Repeat,
// Reminders, Space, Steps, Goal. Every change saves at once; Kriyan never guesses a length.

import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "convex/react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { formatClock, parts, weekday } from "@kriyan/core/dates";
import {
  describeReminder,
  describeRepeat,
  formatDate,
  MONTH_SHORT,
  WEEKDAY_SHORT,
} from "@kriyan/core/format";
import { firstOccurrence } from "@kriyan/core/parse";
import type { Reminder } from "@kriyan/core/reminders";
import { sameRepeat, type Repeat } from "@kriyan/core/repeat";
import { useClock } from "@/data/time";
import { useGoals, useSpaces, type TaskDoc } from "@/data/views";
import { ensureNotifications } from "@/features/notifications/register";
import { NoteEditor } from "@/features/notes/NoteEditor";
import { MonthCard } from "@/features/today/MonthCard";
import { FloatCard, LenChip, T, ty, WideButton } from "@/features/today/parts";
import { useIsPhone } from "@/theme/layout";
import { bold, c, hex, s, spaceTone } from "@/theme/tokens";
import { AutoInput } from "@/ui/AutoInput";
import { DottedRule } from "@/ui/DottedRule";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { errorText } from "./actions";
import { StepList } from "./StepList";

export type Picker = "date" | "time" | "due" | "repeat" | "remind" | "space" | "steps" | "goal";

const LENGTHS: [string, number][] = [
  ["None", 0],
  ["15 min", 15],
  ["30 min", 30],
  ["45 min", 45],
  ["1 h", 60],
  ["1 h 30", 90],
  ["2 h", 120],
  ["3 h", 180],
];
const DUE_TIMES: [string, number][] = [
  ["09:00", 540],
  ["12:00", 720],
  ["17:00", 1020],
  ["23:59", 1439],
];
const REMINDERS: [string, number][] = [
  ["At the time", 0],
  ["10 min before", 10],
  ["1 h before", 60],
  ["1 day before", 1440],
];

function ordinal(n: number): string {
  const sfx = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${sfx}`;
}

/** The repeats Edit offers, named the way the picker lists them, for a task on `day`. */
function repeatOptions(day: string): [string, Repeat | null][] {
  const wd = weekday(day);
  const [, m, d] = parts(day);
  return [
    ["Never", null],
    ["Every day", { freq: "day", interval: 1 }],
    ["Weekdays", { freq: "week", interval: 1, weekdays: [0, 1, 2, 3, 4] }],
    [`Every week on ${WEEKDAY_SHORT[wd]}`, { freq: "week", interval: 1, weekdays: [wd] }],
    [`Every 2 weeks on ${WEEKDAY_SHORT[wd]}`, { freq: "week", interval: 2, weekdays: [wd] }],
    [`Every month on the ${ordinal(d)}`, { freq: "month", interval: 1, monthly: { kind: "day", day: d } }],
    [`Every year on ${d} ${MONTH_SHORT[m - 1]}`, { freq: "year", interval: 1 }],
    ["Every 3 days", { freq: "day", interval: 3 }],
  ];
}

export function EditSheet({
  task,
  onClose,
  initial,
}: {
  task: TaskDoc;
  onClose: () => void;
  initial?: Picker | null;
}) {
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  const { today } = useClock();
  const spaces = useSpaces();
  const goals = useGoals();
  const update = useMutation(api.tasks.update);
  const [title, setTitle] = useState(task.title);
  const [open, setOpen] = useState<Picker | null>(initial ?? null);
  const save = (patch: Omit<Parameters<typeof update>[0], "id">) =>
    update({ id: task._id, ...patch }).catch((e: unknown) => showToast(errorText(e)));
  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) void save({ title: t });
    else setTitle(task.title);
  };
  const space = spaces?.find((sp) => sp._id === task.spaceId);
  const goal = goals?.find((g) => g._id === task.goalId);
  const day = task.date ?? today;
  const repeat = (task.repeat as Repeat | undefined) ?? null;

  const when = repeat ? "Repeats" : task.date ? formatDate(task.date, today) : "No day (Inbox)";
  const time =
    task.time !== undefined
      ? task.length
        ? `${formatClock(task.time)}–${formatClock(task.time + task.length)}`
        : formatClock(task.time)
      : "Any time";
  const due = task.deadline
    ? `${formatDate(task.deadline, today)}${task.dueTime !== undefined ? `, ${formatClock(task.dueTime)}` : ""}`
    : "None";
  const reminders = task.reminders as Reminder[];
  const steps = task.steps ?? [];

  const row = (key: Picker, label: string, value: ReactNode, unset: boolean) => (
    <Press
      key={key}
      role="button"
      accessibilityLabel={`${label}: ${typeof value === "string" ? value : ""}`.replace(/: $/, "")}
      onPress={() => setOpen(key)}
      hoverBg={null}
      style={{ height: 60, flexDirection: "row", alignItems: "center", gap: s.s3 }}
    >
      <T s="row" extra={{ flex: 1 }}>
        {label}
      </T>
      {typeof value === "string" ? (
        <T s="rowMeta" tone={unset ? "ink3" : "ink2"} lines={1} extra={{ flexShrink: 1, textAlign: "right" }}>
          {value}
        </T>
      ) : (
        value
      )}
      <Icon icon={ChevronRight} size={18} tone="ink3" />
      <DottedRule width={2} />
    </Press>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          height: 48 + (phone ? insets.top : 0),
          paddingTop: phone ? insets.top : 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Press
          role="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{
            position: "absolute",
            left: s.s4,
            bottom: s.s1,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.sunken,
          }}
        >
          <Icon icon={ChevronLeft} size={18} tone="ink" strokeWidth={2.5} />
        </Press>
        <Txt heading={1} style={[ty.title, { color: c.ink }]}>
          Edit
        </Txt>
        <Press
          role="button"
          accessibilityLabel="Done"
          onPress={() => (saveTitle(), onClose())}
          hoverBg={null}
          style={{
            position: "absolute",
            right: s.s4,
            bottom: s.s1,
            height: 40,
            justifyContent: "center",
            paddingHorizontal: s.s2,
          }}
        >
          <Txt style={[ty.title, { color: c.parse }]}>Done</Txt>
        </Press>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: s.s6,
          paddingTop: s.s2,
          paddingBottom: s.s16 + insets.bottom,
        }}
      >
        <AutoInput
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          onSubmitEditing={saveTitle}
          submitBehavior="blurAndSubmit"
          accessibilityLabel="Title"
          placeholderTextColor={hex.ink3}
          lineHeight={32}
          padY={0}
          style={[{ fontSize: 28, letterSpacing: -0.8 }, bold, { color: c.ink }]}
        />
        <View style={{ marginTop: s.s2, marginBottom: s.s4 }}>
          <NoteEditor
            key={task._id}
            value={task.note ?? ""}
            placeholder="Add a note"
            onChange={(note) => void save({ note: note || null })}
          />
        </View>
        {row("date", "Day", when, !task.date && !repeat)}
        {row("time", "Time and length", time, task.time === undefined)}
        {task.event ? null : row("due", "Due", due, !task.deadline)}
        {row(
          "repeat",
          "Repeat",
          repeat ? describeRepeat(repeat, task.repeatFirst ?? day, today) : "Never",
          !repeat,
        )}
        {row(
          "remind",
          "Reminders",
          reminders.length ? reminders.map((x) => describeReminder(x)).join(", ") : "None",
          !reminders.length,
        )}
        {row(
          "space",
          "Space",
          space ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: spaceTone(space.color).dot,
                }}
              />
              <T s="rowMeta" tone="ink2">
                {space.name}
              </T>
            </View>
          ) : (
            "None"
          ),
          !space,
        )}
        {task.event
          ? null
          : row(
              "steps",
              "Steps",
              steps.length ? `${steps.filter((x) => x.done).length} of ${steps.length}` : "None",
              !steps.length,
            )}
        {task.event || !goals?.length ? null : row("goal", "Goal", goal?.title ?? "None", !goal)}
      </ScrollView>

      <FloatCard
        open={open !== null}
        onClose={() => setOpen(null)}
        label={open ? PICKER_LABEL[open] : "Picker"}
        center={!phone}
        width={420}
      >
        {open === "date" ? (
          <>
            <PickTitle>Day</PickTitle>
            <MonthCard
              value={task.date ?? null}
              today={today}
              undated={false}
              onPick={(date) => (setOpen(null), void save({ date }))}
            />
            <WideButton
              kind="ghost"
              label="No day, keep in Inbox"
              onPress={() => (setOpen(null), void save({ date: null }))}
            />
          </>
        ) : null}
        {open === "due" ? (
          <>
            <PickTitle>Due</PickTitle>
            <MonthCard
              value={task.deadline ?? null}
              today={today}
              undated={false}
              onPick={(date) => void save({ deadline: date, dueTime: task.dueTime ?? 1439 })}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s4 }}>
              {DUE_TIMES.map(([label, v]) => (
                <LenChip
                  key={v}
                  label={label}
                  on={task.dueTime === v}
                  onPress={() => (setOpen(null), void save({ deadline: task.deadline ?? day, dueTime: v }))}
                />
              ))}
              <LenChip
                label="No time"
                on={Boolean(task.deadline) && task.dueTime === undefined}
                onPress={() => (setOpen(null), void save({ deadline: task.deadline ?? day, dueTime: null }))}
              />
            </View>
            <WideButton
              kind="ghost"
              label="No due date"
              onPress={() => (setOpen(null), void save({ deadline: null, dueTime: null }))}
            />
          </>
        ) : null}
        {open === "time" ? <TimePick task={task} save={save} onClear={() => setOpen(null)} /> : null}
        {open === "repeat" ? (
          <>
            <PickTitle>Repeat</PickTitle>
            {(() => {
              const options = repeatOptions(day);
              const known = !repeat || options.some(([, rule]) => rule && sameRepeat(rule, repeat));
              const own: [string, Repeat | null][] = repeat
                ? [[describeRepeat(repeat, task.repeatFirst ?? day, today), repeat]]
                : [];
              const list: [string, Repeat | null][] = known ? options : [...options, ...own];
              return list.map(([label, rule]) => {
                const on = rule === null ? !repeat : Boolean(repeat && sameRepeat(rule, repeat));
                return (
                  <Option
                    key={label}
                    label={label}
                    on={on}
                    onPress={() => {
                      setOpen(null);
                      if (rule && !task.date) void save({ repeat: rule, date: firstOccurrence(rule, today) });
                      else void save({ repeat: rule });
                    }}
                  />
                );
              });
            })()}
          </>
        ) : null}
        {open === "remind" ? (
          <>
            <PickTitle>Reminders</PickTitle>
            {REMINDERS.map(([label, minutes]) => {
              const on = reminders.some((x) => x.kind === "before" && x.minutes === minutes);
              return (
                <Option
                  key={label}
                  label={label}
                  on={on}
                  toggle
                  onPress={() => {
                    const next: Reminder[] = on
                      ? reminders.filter((x) => !(x.kind === "before" && x.minutes === minutes))
                      : [...reminders, { kind: "before", minutes }];
                    if (!on) void ensureNotifications();
                    void save({ reminders: next, ...(task.date ? {} : { date: today }) });
                  }}
                />
              );
            })}
            <T s="body" tone="ink2" extra={{ marginTop: s.s3 }}>
              {task.time === undefined && !task.deadline
                ? "Set a time or a due date first; reminders count back from it."
                : "Only the reminders you set, nothing else."}
            </T>
          </>
        ) : null}
        {open === "space" ? (
          <>
            <PickTitle>Space</PickTitle>
            <Option
              label="None"
              on={!task.spaceId}
              onPress={() => (setOpen(null), void save({ spaceId: null }))}
            />
            {(spaces ?? []).map((sp) => (
              <Option
                key={sp._id}
                label={sp.name}
                indent={sp.depth}
                dot={spaceTone(sp.color).dot}
                on={task.spaceId === sp._id}
                onPress={() => (setOpen(null), void save({ spaceId: sp._id }))}
              />
            ))}
          </>
        ) : null}
        {open === "steps" ? (
          <>
            <PickTitle>Steps</PickTitle>
            <StepList task={task} />
          </>
        ) : null}
        {open === "goal" ? (
          <>
            <PickTitle>Goal</PickTitle>
            <Option
              label="None"
              on={!task.goalId}
              onPress={() => (setOpen(null), void save({ goalId: null }))}
            />
            {(goals ?? []).map((g) => (
              <Option
                key={g._id}
                label={g.title}
                on={task.goalId === g._id}
                onPress={() => (setOpen(null), void save({ goalId: g._id as Id<"goals"> }))}
              />
            ))}
          </>
        ) : null}
      </FloatCard>
    </View>
  );
}

const PICKER_LABEL: Record<Picker, string> = {
  date: "Day",
  time: "Time and length",
  due: "Due",
  repeat: "Repeat",
  remind: "Reminders",
  space: "Space",
  steps: "Steps",
  goal: "Goal",
};

function PickTitle({ children }: { children: string }) {
  return (
    <Txt heading={2} style={[ty.title, { fontSize: 20, lineHeight: 28, color: c.ink, marginBottom: s.s3 }]}>
      {children}
    </Txt>
  );
}

/** A choice in a picker: a radio, or a switch for reminders (several at once). */
function Option({
  label,
  on,
  onPress,
  toggle,
  indent = 0,
  dot,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  toggle?: boolean;
  indent?: number;
  dot?: string;
}) {
  return (
    <Press
      role={toggle ? "switch" : "radio"}
      aria-checked={on}
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      style={{
        height: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        paddingLeft: indent * s.s4,
      }}
    >
      {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : null}
      <T s="row" extra={{ flex: 1 }}>
        {label}
      </T>
      {toggle ? (
        <View
          style={{
            width: 52,
            height: 32,
            borderRadius: 16,
            padding: 2,
            backgroundColor: on ? c.done : c.lineStrong,
            alignItems: on ? "flex-end" : "flex-start",
          }}
        >
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.onInk }} />
        </View>
      ) : (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: on ? 7 : 2,
            borderColor: on ? c.parse : c.lineStrong,
          }}
        />
      )}
      <DottedRule width={2} />
    </Press>
  );
}

/** Start time in big figures with −/+ 15, then a length from chips (never guessed). */
function TimePick({
  task,
  save,
  onClear,
}: {
  task: TaskDoc;
  save: (patch: { time?: number | null; length?: number | null }) => Promise<unknown>;
  onClear: () => void;
}) {
  const start = task.time ?? 18 * 60;
  const length = task.length ?? 0;
  const step = (by: number) => void save({ time: (start + by + 1440) % 1440 });
  const round = (label: string, by: number, icon: typeof Plus) => (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={() => step(by)}
      style={{
        width: 52,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.select,
      }}
    >
      <Icon icon={icon} size={20} tone="ink" strokeWidth={2.5} />
    </Press>
  );
  return (
    <View>
      <T s="body" tone="ink2" extra={{ textAlign: "center" }}>
        Start
      </T>
      <Txt
        tnum
        accessibilityLabel={`Starts ${formatClock(start)}`}
        style={[ty.figure, { color: c.ink, textAlign: "center" }]}
      >
        {formatClock(start)}
      </Txt>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: s.s4, marginTop: s.s1 }}>
        {round("15 minutes earlier", -15, Minus)}
        {round("15 minutes later", 15, Plus)}
      </View>
      <View
        aria-hidden
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          height: 24,
          marginTop: s.s4,
          marginHorizontal: s.s2,
        }}
      >
        {Array.from({ length: 27 }, (_, i) => (
          <View
            key={i}
            style={{
              width: i === 13 ? 3 : 1.5,
              height: i === 13 ? 32 : 24,
              marginTop: i === 13 ? -4 : 0,
              borderRadius: 1,
              backgroundColor: i === 13 ? c.now : c.lineStrong,
            }}
          />
        ))}
      </View>
      <T s="body" tone="ink2" extra={{ marginTop: s.s6 }}>
        Length
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s3 }}>
        {LENGTHS.map(([label, v]) => (
          <LenChip
            key={v}
            label={label}
            on={length === v}
            onPress={() => void save({ time: start, length: v || null })}
          />
        ))}
      </View>
      <T s="body" tone="ink2" extra={{ marginTop: s.s3 }}>
        {length
          ? `Ends ${formatClock(start + length)}. Kriyan never guesses a length.`
          : "No length: it shows as a moment, not a block."}
      </T>
      <WideButton
        kind="ghost"
        label="Any time"
        onPress={() => (onClear(), void save({ time: null, length: null }))}
      />
    </View>
  );
}

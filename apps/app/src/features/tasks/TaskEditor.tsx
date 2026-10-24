// One editor for every task (docs/design/v4, b2.html?screen=task): the title, the note right
// under it like Apple Notes, then one wrap of chips. A chip is filled for what's set ("Fri
// 10:00–11:30", "3 reminders") and quiet for what isn't ("+ Repeat"); each opens its own small
// picker. A thumb bar holds Start focus, When, Move and More. Every change saves at once.
//
// Each field's picker opens over the task, which stays behind it (b2.html `pickerHTML`): on
// phones a small sheet over the task sheet, on desktop a box under the chips inside the panel.

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "convex/react";
import {
  ArrowRight,
  Bell,
  Calendar,
  CalendarDays,
  Check as CheckGlyph,
  Clock,
  Play,
  Plus,
  CircleDot,
  Ellipsis,
  Flag,
  Hourglass,
  Inbox,
  Repeat2,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import {
  formatDate,
  formatDay,
  WEEKDAY_SHORT,
  formatDuration,
  describeReminder,
  describeRepeat,
} from "@kriyan/core/format";
import { addDays, formatClock, weekday, zonedParts } from "@kriyan/core/dates";
import { firstOccurrence, parseTask } from "@kriyan/core/parse";
import type { Reminder } from "@kriyan/core/reminders";
import type { Repeat } from "@kriyan/core/repeat";
import { useClock } from "@/data/time";
import { useGoals, useSpaces, type TaskDoc } from "@/data/views";
import { ensureNotifications } from "@/features/notifications/register";
import { NoteEditor } from "@/features/notes/NoteEditor";
import { type } from "@kriyan/core/tokens";
import { roleStyle, useIsPhone, useType } from "@/theme/layout";
import { bold, c, family, hex, r, s, shadows, spaceTone } from "@/theme/tokens";
import { AutoInput } from "@/ui/AutoInput";
import { Button } from "@/ui/Button";
import { Check, Chip, Dot, Field } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { DoneButton, Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { completeTask, deleteTask, errorText, reopenTask, ticking } from "./actions";
import { DayPicker, Option, SpacePicker } from "./pickers";
import { ReminderEditor } from "./ReminderEditor";
import { RepeatEditor } from "./RepeatEditor";
import { StepList } from "./StepList";
import { showToast } from "@/ui/toast";

type Sub = "space" | "when" | "length" | "repeat" | "reminders" | "deadline" | "goal" | "more";

interface Props {
  task: TaskDoc;
  onClose: () => void;
  /** Open straight into one field (D, R and M on the keyboard). */
  initialEdit?: "when" | "repeat" | "space";
}

export function TaskEditor({ task, onClose, initialEdit }: Props) {
  const phone = useIsPhone();
  const roles = useType();
  const { today, timeZone } = useClock();
  const spaces = useSpaces();
  const update = useMutation(api.tasks.update);
  const [sub, setSub] = useState<Sub | null>(initialEdit ?? null);
  const spaceRef = useRef<View>(null);
  const whenRef = useRef<View>(null);
  const repeatRef = useRef<View>(null);
  const remindersRef = useRef<View>(null);
  const deadlineRef = useRef<View>(null);
  const lengthRef = useRef<View>(null);
  const goalRef = useRef<View>(null);
  const moreRef = useRef<View>(null);
  const anchor =
    sub === "space"
      ? spaceRef
      : sub === "when"
        ? whenRef
        : sub === "repeat"
          ? repeatRef
          : sub === "reminders"
            ? remindersRef
            : sub === "deadline"
              ? deadlineRef
              : sub === "goal"
                ? goalRef
                : sub === "length"
                  ? lengthRef
                  : moreRef;
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

  // B2's "Sat 10:30 → 12:00": the weekday alone this week's today, the date otherwise; the
  // length has its own chip.
  const when = task.date
    ? task.time !== undefined
      ? `${task.date === today ? WEEKDAY_SHORT[weekday(task.date)] : formatDate(task.date, today)} ${formatClock(task.time)}${task.length ? ` → ${formatClock(task.time + task.length)}` : ""}`
      : `${formatDay(task.date, today)}, anytime`
    : null;

  /** `saves`: the editor has its own Save and Cancel, so the picker's head has no Done. */
  const subEditor = (
    which: Sub,
  ): { title: string; body: ReactNode; width?: number; saves?: boolean } | null => {
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
        return {
          title: "When",
          body: (
            <WhenPicker task={task} today={today} when={when} save={save} onPicked={() => setSub(null)} />
          ),
          width: 340,
        };
      case "length":
        return {
          title: "How long?",
          body: <LengthPicker value={task.length ?? null} today={today} save={save} />,
          width: 340,
        };
      case "repeat":
        return {
          title: "Repeat",
          width: 384,
          saves: true,
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
        return {
          title: "Goal",
          body: (
            <GoalPicker
              value={task.goalId ?? null}
              onPick={(id) => (setSub(null), void save({ goalId: id }))}
            />
          ),
        };
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

  const thumbBar = (
    <ThumbBar
      task={task}
      moreRef={moreRef}
      moreOpen={sub === "more"}
      onWhen={() => setSub(sub === "when" ? null : "when")}
      onMove={() => setSub(sub === "space" ? null : "space")}
      onMore={() => setSub(sub === "more" ? null : "more")}
    />
  );

  const open = sub ? subEditor(sub) : null;
  // Desktop draws the picker inside the panel, under the chips; "More" is a menu over the bar.
  const inline = !phone && open && sub !== "more";

  return (
    <>
      {/* Over the title: phones say what it is, like the prototype's sheet ("Task"); the panel
          says where it lives, in a small filled pill (b2.html `.spc`). */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s1,
          minHeight: phone ? 44 : 52,
          marginTop: phone ? 0 : s.s3,
          paddingLeft: phone ? s.s4 : s.s6,
          paddingRight: phone ? s.s2 : s.s4,
        }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 }}>
          {phone ? (
            <Txt variant="caption" tone="ink3" numberOfLines={1} style={family("600")}>
              {task.event ? "Event" : "Task"}
            </Txt>
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s.s2,
                maxWidth: "100%",
                paddingHorizontal: s.s3,
                paddingVertical: s.s1,
                borderRadius: r.pill,
                backgroundColor: c.sunken,
              }}
            >
              <Dot color={space ? tone.dot : c.ink3} size={7} />
              <Txt variant="label" tone="ink2" numberOfLines={1}>
                {space ? space.path : "No space"}
              </Txt>
            </View>
          )}
        </View>
        <Button icon={X} accessibilityLabel="Close" onPress={onClose} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: phone ? s.s4 : s.s6,
          paddingTop: s.s1,
          paddingBottom: s.s4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s3 }}>
          {/* Centres the box on the first line of the title. */}
          <View
            style={{
              paddingTop: (roles.headline.lineHeight ?? 32) / 2 - TICK_BOX / 2 + (phone ? s.s2 : 0),
              width: TICK_BOX,
              alignItems: "center",
            }}
          >
            {task.event ? (
              <View style={{ width: TICK, height: TICK_BOX, alignItems: "center", justifyContent: "center" }}>
                <Dot color={tone.dot} size={10} />
              </View>
            ) : (
              <Check
                size={TICK}
                color={space ? tone.dot : c.ink3}
                done={done}
                label={`${done ? "Mark not done" : "Complete"}: ${task.title}`}
                onPress={() =>
                  task.doneAt !== undefined ? reopenTask(task._id) : !isTicking && completeTask(task)
                }
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
            lineHeight={roles.headline.lineHeight ?? 32}
            // 32 of text in 8 above and below: a target past 44 on touch.
            padY={phone ? s.s2 : 0}
            style={[roles.headline, bold, { flex: 1, color: done ? c.ink3 : c.ink }]}
          />
        </View>

        {/* The note sits right under the title as plain text, like Apple Notes. */}
        <View style={{ marginTop: s.s1 }}>
          <NoteEditor
            key={task._id}
            value={task.note ?? ""}
            onChange={(note) => void save({ note: note || null })}
          />
        </View>

        <View
          accessibilityLabel="Details"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: phone ? s.s4 : s.s3 }}
        >
          <PropChip
            anchor={whenRef}
            icon={Calendar}
            text={when}
            empty="Date"
            label="When"
            expanded={sub === "when"}
            onPress={() => setSub(sub === "when" ? null : "when")}
          />
          {task.event && !task.length ? null : (
            <PropChip
              anchor={lengthRef}
              icon={Hourglass}
              text={task.length ? formatDuration(task.length) : null}
              empty="Length"
              label="Length"
              expanded={sub === "length"}
              onPress={() => setSub(sub === "length" ? null : "length")}
            />
          )}
          {task.event ? null : (
            <PropChip
              anchor={deadlineRef}
              icon={Flag}
              text={task.deadline ? `Due ${formatDay(task.deadline, today)}` : null}
              empty="Deadline"
              label="Deadline"
              expanded={sub === "deadline"}
              onPress={() => setSub(sub === "deadline" ? null : "deadline")}
            />
          )}
          <PropChip
            anchor={repeatRef}
            icon={Repeat2}
            text={
              task.repeat
                ? describeRepeat(task.repeat as Repeat, task.repeatFirst ?? task.date ?? today, today)
                : null
            }
            empty="Repeat"
            label="Repeat"
            expanded={sub === "repeat"}
            onPress={() => setSub(sub === "repeat" ? null : "repeat")}
          />
          <PropChip
            anchor={remindersRef}
            icon={Bell}
            text={
              task.reminders.length === 0
                ? null
                : task.reminders.length === 1
                  ? describeReminder((task.reminders as Reminder[])[0] as Reminder)
                  : `${task.reminders.length} reminders`
            }
            empty="Reminder"
            label="Reminders"
            expanded={sub === "reminders"}
            onPress={() => setSub(sub === "reminders" ? null : "reminders")}
          />
          <PropChip
            anchor={spaceRef}
            icon={Inbox}
            text={space?.name ?? null}
            empty="Space"
            label="Space"
            leading={space ? <Dot color={tone.dot} /> : undefined}
            expanded={sub === "space"}
            onPress={() => setSub(sub === "space" ? null : "space")}
          />
          {task.event ? null : (
            <GoalChip
              task={task}
              anchor={goalRef}
              expanded={sub === "goal"}
              onPress={() => setSub(sub === "goal" ? null : "goal")}
            />
          )}
        </View>

        {inline && open ? (
          <InlinePicker title={open.title} onDone={open.saves ? undefined : () => setSub(null)}>
            {open.body}
          </InlinePicker>
        ) : null}

        {task.event ? null : <StepList task={task} />}
        {task.event ? null : <Tracked minutes={task.tracked} length={task.length} />}
        {task.addedBy ? (
          <Txt variant="meta" tone="ink3" tnum style={{ marginTop: s.s4 }}>
            {addedLine(task.addedBy, task._creationTime, timeZone, today)}
          </Txt>
        ) : null}
        {/* Phones: room under the content for the floating thumb bar. Desktop: the bar sits
            under the content and sticks to the panel's foot while it scrolls (b2.html `.rp`). */}
        {phone ? <View style={{ height: BAR_ROOM }} /> : thumbBar}
      </ScrollView>

      {phone ? thumbBar : null}

      {inline ? null : (
        <Popover
          open={Boolean(open)}
          onClose={() => setSub(null)}
          anchor={anchor}
          side="above"
          title={open?.title ?? ""}
          width={open?.width ?? 320}
          done={sub !== "more" && !open?.saves}
        >
          {open?.body}
        </Popover>
      )}
    </>
  );
}

/** B2's `.psheet.inl`: the open field's picker inside the panel, under the chips. */
function InlinePicker({
  title,
  onDone,
  children,
}: {
  title: string;
  onDone?: () => void;
  children: ReactNode;
}) {
  return (
    <View
      role="group"
      aria-label={title}
      style={{
        marginTop: s.s2,
        paddingHorizontal: s.s3,
        paddingBottom: s.s3,
        borderRadius: r.box,
        borderWidth: 1,
        borderColor: c.line,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: 52 }}>
        <Txt variant="subhead" heading={2} style={[bold, { flex: 1 }]}>
          {title}
        </Txt>
        {onDone ? <DoneButton onPress={onDone} /> : null}
      </View>
      {children}
    </View>
  );
}

/** "Tracked 25m of 1h 30m": Focus time on this task against its length, when there's either. */
function Tracked({ minutes, length }: { minutes: number; length?: number }) {
  if (!minutes && !length) return null;
  return (
    <Txt variant="meta" tone="ink3" tnum style={{ marginTop: s.s4 }}>
      {`Tracked ${formatDuration(minutes) || "0m"}${length ? ` of ${formatDuration(length)}` : ""}`}
    </Txt>
  );
}

/** "Added by Codex at 07:00" for a task an agent added today, else the day it did. */
function addedLine(agent: string, at: number, timeZone: string, today: string): string {
  const { date, minutes } = zonedParts(at, timeZone);
  return date === today
    ? `Added by ${agent} at ${formatClock(minutes)}`
    : `Added by ${agent} on ${formatDate(date, today)}`;
}

/** A property as a chip: filled when it's set, quiet with a plus when it isn't. */
function PropChip({
  anchor,
  icon,
  text,
  empty,
  label,
  leading,
  expanded,
  onPress,
}: {
  anchor: RefObject<View | null>;
  icon: LucideIcon;
  text: string | null;
  empty: string;
  label: string;
  leading?: ReactNode;
  expanded: boolean;
  onPress: () => void;
}) {
  const phone = useIsPhone();
  const set = text !== null;
  return (
    <View ref={anchor} collapsable={false}>
      <Press
        role="button"
        accessibilityLabel={`${label}: ${text ?? "not set"}`}
        aria-expanded={expanded}
        onPress={onPress}
        hoverBg={null}
        // The chips wrap 8 apart like the prototype's; the target still reaches 44 on touch.
        style={{
          minHeight: phone ? 44 : 36,
          marginVertical: phone ? -s.s1 : 0,
          justifyContent: "center",
          maxWidth: "100%",
        }}
      >
        {({ hovered }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s.s2,
              height: 36,
              paddingHorizontal: s.s3,
              borderRadius: r.card,
              // Set chips are filled; an unset one is only a faint outline, so the set ones read first.
              borderWidth: 1,
              borderColor: set ? "transparent" : c.line,
              backgroundColor: expanded ? c.select : set ? c.sunken : hovered ? c.hover : "transparent",
            }}
          >
            {set ? (
              <>
                <Icon icon={icon} size={16} tone="ink2" />
                {leading}
              </>
            ) : (
              <Icon icon={Plus} size={16} tone="ink3" />
            )}
            <Txt tone={set ? "ink" : "ink3"} numberOfLines={1} tnum style={chipText}>
              {text ?? empty}
            </Txt>
          </View>
        )}
      </Press>
    </View>
  );
}

function GoalChip({
  task,
  anchor,
  expanded,
  onPress,
}: {
  task: TaskDoc;
  anchor: RefObject<View | null>;
  expanded: boolean;
  onPress: () => void;
}) {
  // Goals only: the Progress query reads a year of history, and every tick would re-run it.
  const goals = useGoals();
  const goal = goals?.find((g) => g._id === task.goalId);
  return (
    <PropChip
      anchor={anchor}
      icon={Target}
      text={goal?.title ?? null}
      empty="Goal"
      label="Goal"
      expanded={expanded}
      onPress={onPress}
    />
  );
}

/** Size of the box beside the title (B2's 26px mark paints about 20). */
const TICK = 20;
/** The row the box sits in, so it centres on the title's first line in whole spacing steps. */
const TICK_BOX = 24;
/** The thumb bar's pill: 44 buttons in 4 padding and a 1 border. */
const BAR_HEIGHT = 44 + 2 * s.s1 + 2;
/** Its gap above the sheet's bottom edge and the sides, like the dock's. */
const BAR_GAP = 14;
const BAR_ROOM = BAR_HEIGHT + BAR_GAP + s.s8;

/**
 * Things' bottom bar, at thumb height: the actions people take on a task most. A pill that
 * floats over the sheet's content (b2.html `.tsh-bar`), the same shape as the dock.
 */
function ThumbBar({
  task,
  moreRef,
  moreOpen,
  onWhen,
  onMove,
  onMore,
}: {
  task: TaskDoc;
  /** The More menu opens from here. */
  moreRef: RefObject<View | null>;
  moreOpen: boolean;
  onWhen: () => void;
  onMove: () => void;
  onMore: () => void;
}) {
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  // At large text the bar's labels shorten, so "Start focus" isn't cut to "Start fo…".
  const short = useWindowDimensions().fontScale >= 1.3;
  const done = task.doneAt !== undefined;
  return (
    <View
      pointerEvents="box-none"
      style={
        phone
          ? {
              position: "absolute",
              left: BAR_GAP,
              right: BAR_GAP,
              bottom: BAR_GAP + insets.bottom,
              alignItems: "center",
            }
          : ({ position: "sticky", bottom: s.s4, marginTop: s.s6, alignItems: "center" } as object)
      }
    >
      <View
        style={{
          width: "100%",
          maxWidth: 528,
          flexDirection: "row",
          alignItems: "center",
          gap: s.s1,
          padding: s.s1,
          borderRadius: r.pill,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.raised,
          boxShadow: shadows.overlay,
        }}
      >
        {task.event || done ? null : (
          <BarButton
            primary
            icon={Play}
            label={short ? "Focus" : "Start focus"}
            accessibilityLabel="Start focus"
            onPress={() => router.push(`/focus/${task._id}`)}
          />
        )}
        <BarButton icon={Calendar} label="When" onPress={onWhen} />
        <BarButton icon={ArrowRight} label="Move" onPress={onMove} />
        <View ref={moreRef} collapsable={false}>
          <BarButton icon={Ellipsis} accessibilityLabel="More" expanded={moreOpen} onPress={onMore} />
        </View>
      </View>
    </View>
  );
}

function BarButton({
  icon,
  label,
  accessibilityLabel,
  primary,
  expanded,
  onPress,
}: {
  icon: LucideIcon;
  label?: string;
  accessibilityLabel?: string;
  primary?: boolean;
  expanded?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-expanded={expanded}
      onPress={onPress}
      hoverBg={primary ? null : c.hover}
      rippleRadius={label ? undefined : 22}
      style={({ hovered }) => [
        {
          height: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: s.s2,
          borderRadius: r.pill,
          overflow: "hidden",
        },
        // The prototype's flex 1.5 / 1 / 48: Start focus widest, More just its icon.
        label ? { flexGrow: primary ? 3 : 2, flexBasis: 0, paddingHorizontal: s.s2 } : { width: 48 },
        primary ? { backgroundColor: c.ink } : null,
        primary && hovered ? { opacity: 0.92 } : null,
        expanded ? { backgroundColor: c.select } : null,
      ]}
    >
      {primary ? (
        // Filled, like the prototype's play mark.
        <Play size={16} color={hex.onInk} fill={hex.onInk} aria-hidden focusable={false} />
      ) : (
        <Icon icon={icon} size={16} tone="ink2" />
      )}
      {label ? (
        <Txt variant="label" tone={primary ? "onInk" : "ink2"} numberOfLines={1} style={barLabel}>
          {label}
        </Txt>
      ) : null}
    </Press>
  );
}

/** 14 on both layouts, like the prototype's chips and bar; the phone's label role is 16. */
const chipText = roleStyle(type.label);
const barLabel = { ...chipText, ...family("600") };

function GoalPicker({ value, onPick }: { value: string | null; onPick: (id: Id<"goals"> | null) => void }) {
  const loaded = useGoals();
  const goals = loaded ?? [];
  return (
    <View style={{ gap: 2 }}>
      <Option label="No goal" selected={value === null} onPress={() => onPick(null)} />
      {goals.map((g) => (
        <Option
          key={g._id}
          label={g.title}
          selected={value === g._id}
          onPress={() => onPick(g._id)}
          leading={<Icon icon={Target} size={16} />}
        />
      ))}
      {loaded && goals.length === 0 ? (
        <Txt variant="meta" tone="ink3" style={{ padding: s.s2 }}>
          You have no goals yet. Add one in Progress.
        </Txt>
      ) : null}
    </View>
  );
}

/** B2's length presets (`DUR`): none first, then the usual blocks. */
const LENGTHS = [null, 5, 15, 30, 45, 60, 90, 120, 180] as const;
const TIMES = [9 * 60, 12 * 60, 14 * 60, 17 * 60, 19 * 60];

function withOwn(presets: number[], own: number | undefined): number[] {
  return own === undefined || presets.includes(own) ? presets : [...presets, own].sort((a, b) => a - b);
}

type WhenSave = (patch: {
  date?: string | null;
  time?: number | null;
  length?: number | null;
}) => Promise<unknown>;

/**
 * B2's When picker (`pickerHTML` "when"): what's set, then five big choices with their dates.
 * A day picks and closes. A date further out and the time are one more tap each, so the
 * resting picker stays short and the task shows behind it.
 */
function WhenPicker({
  task,
  today,
  when,
  save,
  onPicked,
}: {
  task: TaskDoc;
  today: string;
  /** The When chip's own words ("Sat 10:30 → 12:00"). */
  when: string | null;
  save: WhenSave;
  onPicked: () => void;
}) {
  const [more, setMore] = useState<"date" | "time" | null>(null);
  const [timeText, setTimeText] = useState("");
  const typedTime = timeText.trim() ? parseTask(`x at ${timeText.trim()}`, today).time : undefined;
  const saturday = addDays(today, (5 - weekday(today) + 7) % 7);
  const days: [string, string][] = [
    ["Today", today],
    ["Tomorrow", addDays(today, 1)],
    ["This weekend", saturday],
    ["Next week", addDays(today, 7 - weekday(today))],
  ];
  const pickDay = (date: string | null) => {
    void save(date ? { date } : { date: null, time: null });
    onPicked();
  };
  const setTime = (time: number | null) =>
    void save({ time, ...(task.date || time === null ? {} : { date: today }) });
  return (
    <View>
      <Txt variant="meta" tone="ink3" tnum style={{ marginBottom: s.s1 }}>
        {when ?? "Not scheduled yet"}
      </Txt>
      {days.map(([label, date], i) => (
        <PickRow
          key={label}
          label={label}
          hint={formatDate(date, today)}
          // On a Saturday "Today" and "This weekend" are the same day: the first one says so.
          selected={task.date === date && days.findIndex(([, d]) => d === date) === i}
          onPress={() => pickDay(date)}
        />
      ))}
      {task.repeat ? null : (
        <PickRow label="Someday, in the inbox" selected={!task.date} onPress={() => pickDay(null)} />
      )}
      <PickRow
        label="Pick a date"
        icon={CalendarDays}
        expanded={more === "date"}
        onPress={() => setMore(more === "date" ? null : "date")}
      />
      {more === "date" ? (
        <View style={{ paddingVertical: s.s3 }}>
          <DayPicker
            value={task.date ?? null}
            today={today}
            allowNone={false}
            quick={false}
            onPick={pickDay}
          />
        </View>
      ) : null}
      <PickRow
        label="Time"
        icon={Clock}
        hint={task.time !== undefined ? formatClock(task.time) : "Anytime"}
        expanded={more === "time"}
        last={more !== "time"}
        onPress={() => setMore(more === "time" ? null : "time")}
      />
      {more === "time" ? (
        <View style={{ gap: s.s3, paddingTop: s.s3 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
            {withOwn(TIMES, task.time).map((m) => (
              <Chip key={m} label={formatClock(m)} on={task.time === m} onPress={() => setTime(m)} />
            ))}
            <Chip label="Anytime" on={task.time === undefined} onPress={() => setTime(null)} />
          </View>
          <Field
            label="Time"
            value={timeText}
            onChangeText={setTimeText}
            placeholder="Type a time, like 14:30 or 2pm"
            onSubmitEditing={() => {
              if (typedTime !== undefined) {
                setTime(typedTime);
                setTimeText("");
              }
            }}
            trailing={
              timeText.trim() ? (
                <Txt variant="meta" tone="ink3">
                  {typedTime !== undefined ? `Enter for ${formatClock(typedTime)}` : "Not a time yet"}
                </Txt>
              ) : null
            }
          />
        </View>
      ) : null}
    </View>
  );
}

/** One big choice in a field's picker (b2.html `.plist button`): 48 tall, dotted apart. */
function PickRow({
  label,
  hint,
  icon,
  selected,
  expanded,
  last,
  onPress,
}: {
  label: string;
  hint?: string;
  icon?: LucideIcon;
  selected?: boolean;
  expanded?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      aria-pressed={selected}
      aria-expanded={expanded}
      onPress={onPress}
      scale={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        minHeight: 48,
        borderBottomWidth: last ? 0 : 1,
        borderStyle: "dotted",
        borderColor: c.lineStrong,
      }}
    >
      {icon ? <Icon icon={icon} size={18} tone="ink2" /> : null}
      <Txt variant="body" numberOfLines={1} style={[{ flex: 1 }, selected ? family("600") : null]}>
        {label}
      </Txt>
      {hint ? (
        <Txt variant="meta" tone="ink3" tnum>
          {hint}
        </Txt>
      ) : null}
      {selected ? <Icon icon={CheckGlyph} size={16} tone="ink2" /> : null}
    </Press>
  );
}

/** B2's "How long?" (`.pgrid`): nine presets three across, and a typed length for the rest. */
function LengthPicker({ value, today, save }: { value: number | null; today: string; save: WhenSave }) {
  const [text, setText] = useState("");
  const typed = text.trim() ? parseTask(`x for ${text.trim()}`, today).length : undefined;
  const presets: (number | null)[] = [...LENGTHS];
  if (value !== null && !presets.includes(value)) presets.push(value);
  return (
    <View style={{ gap: s.s3 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {presets.map((m) => {
          const on = value === m;
          return (
            <Press
              key={m ?? "none"}
              role="button"
              aria-pressed={on}
              accessibilityLabel={m ? formatDuration(m) : "No length"}
              onPress={() => void save({ length: m })}
              hoverBg={on ? null : c.select}
              style={{
                // Three to a row: a third of the row less the gaps.
                flexBasis: "30%",
                flexGrow: 1,
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: r.card,
                backgroundColor: on ? c.ink : c.sunken,
              }}
            >
              <Txt tone={on ? "onInk" : "ink"} tnum style={barLabel}>
                {m ? formatDuration(m) : "No length"}
              </Txt>
            </Press>
          );
        })}
      </View>
      <Txt variant="meta" tone="ink3">
        Optional. Kriyan never guesses a length, so leave it empty if you don&apos;t know.
      </Txt>
      <Field
        label="Length"
        value={text}
        onChangeText={setText}
        placeholder="Another length, like 1h45"
        onSubmitEditing={() => {
          if (typed !== undefined) {
            void save({ length: typed });
            setText("");
          }
        }}
        trailing={
          text.trim() ? (
            <Txt variant="meta" tone="ink3">
              {typed !== undefined ? `Enter for ${formatDuration(typed)}` : "Not a length yet"}
            </Txt>
          ) : null
        }
      />
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

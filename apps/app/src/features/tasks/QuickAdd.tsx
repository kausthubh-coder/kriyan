// Quick add (b2.html `addHTML`): one sentence becomes a task, an event or a habit. It parses as
// you type with the same grammar as the server (parseTask from core); the words it understood
// turn blue inside the field, and each detail shows as a blue chip under it. Tapping a chip
// takes its words out. Saves with tasks.addText (or organize.addHabit).

import { playSound } from "@/features/feel/sound";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Text, TextInput, View, type TextStyle } from "react-native";
import { useMutation } from "convex/react";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Clock,
  Flag,
  Hourglass,
  Inbox,
  Repeat2,
  type LucideIcon,
} from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { diffDays, formatClock, type CivilDate } from "@kriyan/core/dates";
import { formatDay, formatDue, formatDuration, describeReminder, describeRepeat } from "@kriyan/core/format";
import { parseTask, type ParsedTask, type SpanKind } from "@kriyan/core/parse";
import type { Repeat } from "@kriyan/core/repeat";
import { useClock } from "@/data/time";
import { useSpaces, type SpaceNode } from "@/data/views";
import { ensureNotifications } from "@/features/notifications/register";
import { useIsPhone } from "@/theme/layout";
import { bold, c, family, hex, r, s, spaceTone } from "@/theme/tokens";
import { Dot } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { errorText } from "./actions";

export interface QuickAddHandle {
  focus: () => void;
}

type Kind = "task" | "event" | "habit";

interface Props {
  /** "inline" is the desktop field on Today; "sheet" fills the add sheet or dialog. */
  variant: "inline" | "sheet";
  /** Tasks without a date land here (Today's field adds to today). */
  defaultDate?: string;
  /** Tasks without a #space land here (a space's own page adds to that space). */
  defaultSpaceId?: Id<"spaces">;
  /** Text the field starts with, like "today at 13:30 " from a free stretch. */
  initialText?: string;
  autoFocus?: boolean;
  onAdded?: () => void;
  /** The sheet's close button and Escape. */
  onClose?: () => void;
  placeholder?: string;
}

const EXAMPLE = "Gym tomorrow 7am for 45m every mon wed fri remind 10m before #health";

const KIND_LABEL: Record<Kind, string> = { habit: "Habit", task: "Task", event: "Event" };

const PLACEHOLDER: Record<Kind, string> = {
  task: "Task title",
  event: "Event title",
  habit: "Habit, like Read 20 pages every day",
};

export function findSpace(spaces: SpaceNode[] | undefined, name: string): SpaceNode | undefined {
  if (!spaces) return undefined;
  const parts = name.split("/").map((p) => p.trim().toLowerCase());
  const last = parts[parts.length - 1];
  return (
    spaces.find(
      (sp) => sp.path.toLowerCase().split(" / ").slice(-parts.length).join("/") === parts.join("/"),
    ) ?? spaces.find((sp) => sp.name.toLowerCase() === last)
  );
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * The words quick add starts with for a day and a time, in the grammar it parses: "today at
 * 13:30 ", "tomorrow at 13:30 ", "27 oct at 13:30 ". The person types the title after them.
 */
export function whenWords(date: CivilDate, minutes: number | null, today: CivilDate): string {
  const diff = diffDays(date, today);
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = diff === 0 ? "today" : diff === 1 ? "tomorrow" : `${d} ${MONTHS[m - 1]}`;
  return minutes === null ? `${day} ` : `${day} at ${formatClock(minutes)} `;
}

interface ChipSpec {
  key: string;
  label: string;
  icon: LucideIcon;
  dot?: string;
  kinds: SpanKind[];
}

function chipsFor(parsed: ParsedTask, today: string, spaces: SpaceNode[] | undefined): ChipSpec[] {
  const out: ChipSpec[] = [];
  if (parsed.date)
    out.push({ key: "date", label: formatDay(parsed.date, today), icon: CalendarDays, kinds: ["date"] });
  if (parsed.time !== undefined)
    out.push({ key: "time", label: formatClock(parsed.time), icon: Clock, kinds: ["time"] });
  if (parsed.length)
    out.push({ key: "length", label: formatDuration(parsed.length), icon: Hourglass, kinds: ["length"] });
  if (parsed.repeat)
    out.push({
      key: "repeat",
      label: describeRepeat(parsed.repeat, parsed.date ?? today, today, { compact: true }),
      icon: Repeat2,
      kinds: ["repeat"],
    });
  parsed.reminders.forEach((rem, i) =>
    out.push({
      key: `rem${i}`,
      label: describeReminder(rem),
      icon: i === 0 ? Bell : AlarmClock,
      kinds: ["reminder"],
    }),
  );
  if (parsed.deadline)
    out.push({
      key: "deadline",
      label: formatDue(parsed.deadline, parsed.dueTime, today),
      icon: Flag,
      kinds: ["deadline"],
    });
  if (parsed.spaceName) {
    const match = findSpace(spaces, parsed.spaceName);
    out.push({
      key: "space",
      label: match
        ? match.path
        : `New space: ${parsed.spaceName
            .split("/")
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(" / ")}`,
      icon: Inbox,
      dot: match ? spaceTone(match.color).dot : undefined,
      kinds: ["space"],
    });
  }
  return out;
}

/** The input with every span of the given kinds cut out. */
function without(text: string, parsed: ParsedTask, kinds: SpanKind[]): string {
  let out = text;
  for (const span of [...parsed.spans]
    .filter((sp) => kinds.includes(sp.kind))
    .sort((a, b) => b.start - a.start)) {
    out = out.slice(0, span.start) + out.slice(span.end);
  }
  return out.replace(/\s+/g, " ").trimStart();
}

/** Times a week for a habit, from its repeat: "every mon wed fri" is 3, "every day" is 7. */
function habitTarget(repeat: Repeat | undefined): number {
  if (!repeat) return 7;
  if (repeat.freq === "day") return Math.max(1, Math.min(7, Math.round(7 / repeat.interval)));
  if (repeat.freq === "week") return repeat.interval === 1 ? Math.min(7, repeat.weekdays?.length ?? 1) : 1;
  return 1;
}

export const QuickAdd = forwardRef<QuickAddHandle, Props>(function QuickAdd(
  {
    variant,
    defaultDate,
    defaultSpaceId,
    initialText,
    autoFocus,
    onAdded,
    onClose,
    placeholder = "Add a task, like “essay fri 5pm every week”",
  },
  ref,
) {
  const { today } = useClock();
  const spaces = useSpaces();
  const addText = useMutation(api.tasks.addText);
  const update = useMutation(api.tasks.update);
  const addHabit = useMutation(api.organize.addHabit);
  const phone = useIsPhone();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState(initialText ?? "");
  const [kind, setKind] = useState<Kind>("task");
  const [busy, setBusy] = useState(false);
  // A hardware Enter fires both the key handler and onSubmitEditing in the same frame, before
  // `busy` re-renders: the ref stops the second from adding the task again.
  const submitting = useRef(false);
  const sheet = variant === "sheet";
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  // Prefilled words ("today at 13:30 ") leave the caret after them, ready for the title.
  useEffect(() => {
    if (!initialText || Platform.OS !== "web") return;
    const el = input.current as unknown as HTMLTextAreaElement | null;
    const id = setTimeout(() => el?.setSelectionRange?.(initialText.length, initialText.length), 0);
    return () => clearTimeout(id);
  }, [initialText]);

  const parsed = useMemo(() => parseTask(text, today), [text, today]);
  const chips = useMemo(() => chipsFor(parsed, today, spaces), [parsed, today, spaces]);
  // The day it lands on: the sentence's, the screen's, today for a time with no day (as the
  // server does) or for an event, else the inbox. A task with only a due date keeps no day:
  // Today offers it to fit in on the day it's due.
  const fallback = kind === "task" && parsed.deadline && parsed.time === undefined ? undefined : defaultDate;
  const day: CivilDate | null =
    parsed.date ?? fallback ?? (parsed.time !== undefined || kind === "event" ? today : null);
  const dayWord = day
    ? formatDay(day, today)
        .replace(/^Today$/, "today")
        .replace(/^Tomorrow$/, "tomorrow")
    : null;
  const buttonLabel = kind === "habit" ? "Add habit" : dayWord ? `Add ${kind} to ${dayWord}` : "Add to inbox";

  const submit = async () => {
    const value = text.trim();
    if (!value || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (kind === "habit") {
        const space = parsed.spaceName ? findSpace(spaces, parsed.spaceName) : undefined;
        await addHabit({
          title: parsed.title || value,
          target: habitTarget(parsed.repeat),
          ...(space ? { spaceId: space._id } : defaultSpaceId ? { spaceId: defaultSpaceId } : {}),
        });
        showToast(`Added habit: ${parsed.title || value}`);
      } else {
        const date = parsed.date ? undefined : (fallback ?? (kind === "event" ? today : undefined));
        const id = await addText({
          text: value,
          ...(date ? { date } : {}),
          ...(defaultSpaceId && !parsed.spaceName ? { spaceId: defaultSpaceId } : {}),
        });
        if (kind === "event") await update({ id, event: true });
        const where = day
          ? formatDay(day, today)
          : parsed.spaceName
            ? (findSpace(spaces, parsed.spaceName)?.name ?? parsed.spaceName)
            : defaultSpaceId
              ? (spaces?.find((sp) => sp._id === defaultSpaceId)?.name ?? "this space")
              : "Inbox";
        showToast(`Added to ${inSentence(where)}: ${parsed.title || value}`);
        if (parsed.reminders.length || parsed.time !== undefined) void ensureNotifications();
      }
      playSound("tick");
      setText("");
      onAdded?.();
    } catch (e) {
      showToast(errorText(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const fieldText: TextStyle = sheet
    ? { ...bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7 }
    : { ...family("500"), fontSize: 16, lineHeight: 24 };
  const minLines = sheet ? 2 : 1;

  const field = (
    <ParsedField
      ref={input}
      text={text}
      parsed={parsed}
      onChangeText={setText}
      onSubmit={() => void submit()}
      onEscape={() => {
        // The sheet closes at once; Today's field clears and lets go of the keyboard.
        if (onClose) onClose();
        else {
          setText("");
          input.current?.blur();
        }
      }}
      autoFocus={autoFocus}
      placeholder={sheet ? PLACEHOLDER[kind] : placeholder}
      label={sheet ? PLACEHOLDER[kind] : "Add a task"}
      textStyle={fieldText}
      // At least 24 tall (44 on touch), so the one-line field is a full target (Hit Areas).
      minHeight={Math.max(phone ? 44 : 24, (fieldText.lineHeight ?? 20) * minLines)}
    />
  );

  const parsedChips = chips.map((chip) => (
    <ParsedChip
      key={chip.key}
      label={chip.label}
      icon={chip.icon}
      dot={chip.dot}
      small={!sheet}
      onPress={() => setText(without(text, parsed, chip.kinds))}
    />
  ));

  if (!sheet) {
    // v5's `.qadd`: a soft field under the week; what it understood shows as blue chips.
    return (
      <View
        style={{
          paddingVertical: s.s3,
          paddingHorizontal: s.s4,
          borderRadius: r.box,
          backgroundColor: c.sunken,
          gap: s.s2,
        }}
      >
        {field}
        {text ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
            {chips.length ? (
              parsedChips
            ) : (
              <QuietChip label={day ? formatDay(day, today) : "Inbox"} icon={CalendarDays} small />
            )}
          </View>
        ) : null}
      </View>
    );
  }

  // The sheet's quiet chips say what isn't set yet (v5 `addSheet`).
  const has = (k: string) => chips.some((ch) => ch.key === k);
  const quiet: { key: string; label: string; icon: LucideIcon; set?: boolean }[] = [];
  if (kind === "habit")
    quiet.push({ key: "often", label: "Every day, or say “every mon wed”", icon: Repeat2 });
  else {
    if (!has("date"))
      quiet.push({
        key: "date",
        label: day ? formatDay(day, today) : "No day",
        icon: CalendarDays,
        set: Boolean(day),
      });
    if (!has("time")) quiet.push({ key: "time", label: "Add time", icon: Clock });
    if (kind === "task" && !has("deadline")) quiet.push({ key: "due", label: "Due", icon: Flag });
  }

  return (
    <View style={{ gap: s.s3, flex: 1 }}>
      <View
        role="tablist"
        aria-label="Add a"
        style={{ flexDirection: "row", justifyContent: "center", gap: s.s1 }}
      >
        {(["habit", "task", "event"] as const).map((k) => (
          <Press
            key={k}
            role="tab"
            aria-selected={kind === k}
            accessibilityLabel={KIND_LABEL[k]}
            onPress={() => setKind(k)}
            hoverBg={null}
            style={{
              minHeight: 40,
              justifyContent: "center",
              paddingHorizontal: s.s4,
              borderRadius: r.box,
              backgroundColor: kind === k ? c.sunken : "transparent",
            }}
          >
            <Txt
              style={{ ...family("500"), fontSize: 16, lineHeight: 24, color: kind === k ? c.ink : c.ink3 }}
            >
              {KIND_LABEL[k]}
            </Txt>
          </Press>
        ))}
      </View>
      <View style={{ marginTop: s.s2, paddingHorizontal: s.s2 }}>{field}</View>
      <View style={{ paddingHorizontal: s.s2, minHeight: 24 }}>
        {text ? null : (
          <Press
            role="button"
            accessibilityLabel="Try an example"
            onPress={() => setText(kind === "habit" ? "Read 20 pages every day" : EXAMPLE)}
            hoverBg={null}
            style={{ alignSelf: "flex-start" }}
          >
            <Txt style={{ ...family("400"), fontSize: 16, lineHeight: 24, color: c.ink3 }}>
              {kind === "habit"
                ? "Try “Read 20 pages every day”"
                : "Try “HW21 due thu 23:59 #school” or “gym every monday 7am”"}
            </Txt>
          </Press>
        )}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {quiet.map((q) => (
          <QuietChip key={q.key} label={q.label} icon={q.icon} set={q.set} />
        ))}
        {parsedChips}
      </View>
      <Press
        role="button"
        accessibilityLabel={buttonLabel}
        onPress={() => void submit()}
        disabled={!parsed.title.trim() || busy}
        hoverBg={null}
        style={({ hovered }: { hovered?: boolean }) => ({
          height: 56,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: r.box,
          backgroundColor: parsed.title.trim() ? c.ink : c.sunken,
          opacity: hovered && parsed.title.trim() ? 0.92 : 1,
        })}
      >
        <Txt
          style={{
            ...family("600"),
            fontSize: 16,
            lineHeight: 24,
            color: parsed.title.trim() ? c.onInk : c.ink3,
          }}
        >
          Add
        </Txt>
      </Press>
    </View>
  );
});

/**
 * The field with the understood words in blue. On the web a textarea can't colour its own
 * words, so a copy of the text sits under a transparent textarea that keeps the caret; Android's
 * TextInput takes styled children directly.
 */
const ParsedField = forwardRef<
  TextInput,
  {
    text: string;
    parsed: ParsedTask;
    onChangeText: (t: string) => void;
    onSubmit: () => void;
    onEscape: () => void;
    autoFocus?: boolean;
    placeholder: string;
    label: string;
    textStyle: TextStyle;
    minHeight: number;
  }
>(function ParsedField(
  { text, parsed, onChangeText, onSubmit, onEscape, autoFocus, placeholder, label, textStyle, minHeight },
  ref,
) {
  const spans = segments(text, parsed).map((seg, i) => (
    <Text key={i} style={{ color: seg.kind ? c.parse : c.ink }}>
      {seg.text}
    </Text>
  ));
  const common = {
    onChangeText,
    autoFocus,
    placeholder,
    placeholderTextColor: hex.ink3,
    accessibilityLabel: label,
    autoCapitalize: "sentences" as const,
    // The grammar ("9am", "20m", "#life") isn't misspelt English; the keyboard mustn't fix it.
    autoCorrect: false,
    spellCheck: false,
    multiline: true,
    returnKeyType: "done" as const,
    submitBehavior: "submit" as const,
    onSubmitEditing: onSubmit,
  };

  if (Platform.OS !== "web") {
    return (
      <TextInput
        ref={ref}
        {...common}
        style={[textStyle, { color: c.ink, padding: 0, minHeight, maxHeight: 140 }]}
      >
        {spans}
      </TextInput>
    );
  }
  return (
    // B2's sentence has no box around it, even while typing: the caret is the focus (W-add-2).
    <View style={{ position: "relative", minHeight }} {...({ dataSet: { focus: "caret" } } as object)}>
      {/* In the flow, so it sets the height; the zero-width space keeps a trailing line open. */}
      <Text
        aria-hidden
        style={[textStyle, { color: c.ink, whiteSpace: "pre-wrap", overflowWrap: "break-word" } as TextStyle]}
      >
        {spans}
        {"​"}
      </Text>
      <TextInput
        ref={ref}
        {...common}
        value={text}
        onKeyPress={(e) => {
          const key = e.nativeEvent.key;
          if (key === "Escape") onEscape();
          // A textarea would add a new line; Enter adds the task, as on the phone.
          const shift = (e.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey;
          if (key === "Enter" && !shift) {
            e.preventDefault();
            onSubmit();
          }
        }}
        style={[
          textStyle,
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: 0,
            color: "transparent",
            caretColor: c.ink,
            overflow: "hidden",
            outlineStyle: "none",
            resize: "none",
          } as object,
        ]}
      />
    </View>
  );
});

/** A detail quick add understood, in the parser's blue; tapping it takes its words out. */
function ParsedChip({
  label,
  icon,
  dot,
  small,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  dot?: string;
  small?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={`Remove ${label}`}
      onPress={onPress}
      hoverBg={null}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        height: small ? 32 : 44,
        paddingHorizontal: s.s3,
        borderRadius: r.pill,
        backgroundColor: c.parseFill,
      }}
    >
      {dot ? (
        <Dot color={dot} size={10} />
      ) : (
        <Icon icon={icon} size={small ? 14 : 18} tone="parse" strokeWidth={2.25} />
      )}
      <Txt
        tnum
        numberOfLines={1}
        style={{ ...family("500"), fontSize: small ? 14 : 16, lineHeight: 20, color: c.parse }}
      >
        {label}
      </Txt>
    </Press>
  );
}

/** What isn't set yet, quietly (v5 `.chip`); `set` when it lands somewhere anyway. */
function QuietChip({
  label,
  icon,
  small,
  set,
}: {
  label: string;
  icon: LucideIcon;
  small?: boolean;
  set?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        height: small ? 32 : 44,
        paddingHorizontal: s.s3,
        borderRadius: r.pill,
        backgroundColor: small ? c.bg : c.sunken,
      }}
    >
      <Icon icon={icon} size={small ? 14 : 18} tone={set ? "ink" : "ink3"} strokeWidth={2.25} />
      <Txt
        numberOfLines={1}
        style={{ ...family("500"), fontSize: small ? 14 : 16, lineHeight: 20, color: set ? c.ink : c.ink3 }}
      >
        {label}
      </Txt>
    </View>
  );
}

/** "Today" and "Tomorrow" are labels; inside a sentence they're words. */
function inSentence(day: string): string {
  return day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day;
}

function segments(text: string, parsed: ParsedTask): { text: string; kind?: SpanKind }[] {
  const out: { text: string; kind?: SpanKind }[] = [];
  let at = 0;
  for (const span of parsed.spans) {
    if (span.start < at) continue;
    if (span.start > at) out.push({ text: text.slice(at, span.start) });
    out.push({ text: text.slice(span.start, span.end), kind: span.kind });
    at = span.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

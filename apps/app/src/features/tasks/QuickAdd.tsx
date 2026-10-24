// Quick add (b2.html `addHTML`): one sentence becomes a task, an event or a habit. It parses as
// you type with the same grammar as the server (parseTask from core); the words it understood
// turn blue inside the field, and each detail shows as a blue chip under it. Tapping a chip
// takes its words out. Saves with tasks.addText (or organize.addHabit).

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
  Plus,
  Repeat2,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { diffDays, formatClock, type CivilDate } from "@kriyan/core/dates";
import { formatDay, formatDuration, describeReminder, describeRepeat } from "@kriyan/core/format";
import { parseTask, type ParsedTask, type SpanKind } from "@kriyan/core/parse";
import type { Repeat } from "@kriyan/core/repeat";
import { useClock } from "@/data/time";
import { useSpaces, type SpaceNode } from "@/data/views";
import { ensureNotifications } from "@/features/notifications/register";
import { useIsPhone, useType } from "@/theme/layout";
import { c, hex, r, s, shadows, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Dot } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { errorText } from "./actions";
import { Segmented } from "./Segmented";

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
      label: describeRepeat(parsed.repeat, parsed.date ?? today, today),
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
      label: `Due ${formatDay(parsed.deadline, today)}`,
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

/** The details not set yet, as quiet chips that teach the grammar (the sheet only). */
function missingFor(
  parsed: ParsedTask,
): { key: string; label: string; icon: LucideIcon; dashed?: boolean }[] {
  const out: { key: string; label: string; icon: LucideIcon; dashed?: boolean }[] = [];
  if (!parsed.date) out.push({ key: "date", label: "No date", icon: CalendarDays });
  if (parsed.time === undefined) out.push({ key: "time", label: "No time", icon: Clock });
  // Dashed: Kriyan never guesses a length, so its absence is a choice, not a gap.
  if (!parsed.length) out.push({ key: "length", label: "No length", icon: Hourglass, dashed: true });
  if (!parsed.repeat) out.push({ key: "repeat", label: "No repeat", icon: Repeat2 });
  if (!parsed.reminders.length) out.push({ key: "rem", label: "No reminder", icon: Bell });
  if (!parsed.spaceName) out.push({ key: "space", label: "No space", icon: Inbox });
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
  const roles = useType();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState(initialText ?? "");
  const [kind, setKind] = useState<Kind>("task");
  const [busy, setBusy] = useState(false);
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
  // server does) or for an event, else the inbox.
  const day: CivilDate | null =
    parsed.date ?? defaultDate ?? (parsed.time !== undefined || kind === "event" ? today : null);
  const dayWord = day
    ? formatDay(day, today)
        .replace(/^Today$/, "today")
        .replace(/^Tomorrow$/, "tomorrow")
    : null;
  const buttonLabel = kind === "habit" ? "Add habit" : dayWord ? `Add ${kind} to ${dayWord}` : "Add to inbox";

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
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
        const date = parsed.date ? undefined : (defaultDate ?? (kind === "event" ? today : undefined));
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
      setText("");
      onAdded?.();
    } catch (e) {
      showToast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const fieldText: TextStyle = sheet ? roles.title : roles.body;
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
      textStyle={fieldText}
      // At least 24 tall, so the one-line field is a full target (Hit Areas).
      minHeight={Math.max(24, (fieldText.lineHeight ?? 20) * minLines)}
    />
  );

  const chipRow =
    chips.length || sheet ? (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {chips.map((chip) => (
          <ParsedChip
            key={chip.key}
            label={chip.label}
            icon={chip.icon}
            dot={chip.dot}
            onPress={() => setText(without(text, parsed, chip.kinds))}
          />
        ))}
        {sheet && kind !== "habit"
          ? missingFor(parsed).map((m) => (
              <QuietChip key={m.key} label={m.label} icon={m.icon} dashed={m.dashed} />
            ))
          : null}
      </View>
    ) : null;

  if (!sheet) {
    return (
      <View style={{ gap: s.s3 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: s.s3,
            minHeight: 44,
            paddingVertical: s.s3,
            paddingLeft: s.s4,
            paddingRight: s.s3,
            borderRadius: r.card,
            backgroundColor: c.raised,
            boxShadow: shadows.raised,
          }}
        >
          <Icon icon={Plus} />
          <View style={{ flex: 1, minWidth: 0 }}>{field}</View>
          {text ? null : (
            <Txt variant="caption" tone="ink3">
              N
            </Txt>
          )}
        </View>
        {chips.length ? <View style={{ paddingHorizontal: s.s1 }}>{chipRow}</View> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: s.s3 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Segmented
          label="Add a"
          value={kind}
          options={[
            { value: "task", label: "Task" },
            { value: "event", label: "Event" },
            { value: "habit", label: "Habit" },
          ]}
          onChange={setKind}
        />
        {onClose ? <Button icon={X} accessibilityLabel="Close" onPress={onClose} /> : null}
      </View>
      <View style={{ marginTop: s.s1 }}>{field}</View>
      {chipRow}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: s.s1 }}>
        <Txt variant="meta" tone="ink3">
          {text ? "Words in blue set the details. Delete them to undo." : "Type it like you'd say it."}
        </Txt>
        {text ? null : (
          <Press
            role="button"
            accessibilityLabel="Try an example"
            onPress={() => setText(EXAMPLE)}
            hoverBg={null}
            style={{ minHeight: phone ? 44 : 24, justifyContent: "center" }}
          >
            <Txt variant="meta" tone="parse" style={{ fontWeight: "600" }}>
              Try an example
            </Txt>
          </Press>
        )}
      </View>
      <Press
        role="button"
        accessibilityLabel={buttonLabel}
        onPress={() => void submit()}
        disabled={!parsed.title.trim() || busy}
        hoverBg={null}
        style={({ hovered }: { hovered?: boolean }) => ({
          minHeight: 52,
          marginTop: s.s1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: s.s4,
          borderRadius: r.card,
          backgroundColor: parsed.title.trim() ? c.ink : c.sunken,
          opacity: hovered && parsed.title.trim() ? 0.92 : 1,
        })}
      >
        <Txt variant="subhead" tone={parsed.title.trim() ? "onInk" : "ink3"}>
          {buttonLabel}
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
    textStyle: TextStyle;
    minHeight: number;
  }
>(function ParsedField(
  { text, parsed, onChangeText, onSubmit, onEscape, autoFocus, placeholder, textStyle, minHeight },
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
    accessibilityLabel: "What do you want to do?",
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
    <View style={{ position: "relative", minHeight }}>
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
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  dot?: string;
  onPress: () => void;
}) {
  const phone = useIsPhone();
  return (
    <Press
      role="button"
      accessibilityLabel={`Remove ${label}`}
      onPress={onPress}
      hoverBg={null}
      style={{ minHeight: phone ? 44 : 32, justifyContent: "center", marginVertical: phone ? -s.s1 : 0 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s2,
          height: phone ? 36 : 32,
          paddingHorizontal: s.s3,
          borderRadius: r.card,
          // The blue space's surface is the prototype's --blue-bg: the parser's blue, lightly.
          backgroundColor: spaceTone("blue").surface,
        }}
      >
        <Icon icon={icon} size={16} tone="parse" />
        {dot ? <Dot color={dot} /> : null}
        <Txt variant="label" tone="parse" tnum numberOfLines={1} style={{ fontSize: 14, lineHeight: 20 }}>
          {label}
        </Txt>
      </View>
    </Press>
  );
}

function QuietChip({ label, icon, dashed }: { label: string; icon: LucideIcon; dashed?: boolean }) {
  const phone = useIsPhone();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        height: phone ? 36 : 32,
        paddingHorizontal: s.s3,
        borderRadius: r.card,
        borderWidth: 1,
        borderStyle: dashed ? "dashed" : "solid",
        borderColor: c.lineStrong,
      }}
    >
      <Icon icon={icon} size={16} />
      <Txt variant="label" tone="ink3" numberOfLines={1} style={{ fontSize: 14, lineHeight: 20 }}>
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

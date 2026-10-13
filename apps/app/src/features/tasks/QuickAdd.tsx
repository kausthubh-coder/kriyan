// Quick add: one sentence becomes a task. It parses as you type with the same grammar as the
// server (parseTask from core), shows each recognised phrase as a chip you can remove, and
// saves with tasks.addText.

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { useMutation } from "convex/react";
import { AlarmClock, Bell, CalendarDays, Flag, Hourglass, Plus, Repeat2 } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { formatDay, formatDuration, describeReminder, describeRepeat } from "@kriyan/core/format";
import { formatClock } from "@kriyan/core/dates";
import { parseTask, type ParsedTask, type SpanKind } from "@kriyan/core/parse";
import { useClock } from "@/data/time";
import { useSpaces, type SpaceNode } from "@/data/views";
import { ensureNotifications } from "@/features/notifications/register";
import { useIsPhone, useType } from "@/theme/layout";
import { c, hex, r, s, shadows, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Dot } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { errorText } from "./actions";

export interface QuickAddHandle {
  focus: () => void;
}

interface Props {
  /** "inline" is the desktop field on Today; "sheet" fills the phone's add sheet. */
  variant: "inline" | "sheet";
  /** Tasks without a date land here (Today's field adds to today). */
  defaultDate?: string;
  autoFocus?: boolean;
  onAdded?: () => void;
  placeholder?: string;
}

interface ChipSpec {
  key: string;
  label: string;
  icon?: Parameters<typeof Icon>[0]["icon"];
  dot?: string;
  kinds: SpanKind[];
}

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

function chipsFor(parsed: ParsedTask, today: string, spaces: SpaceNode[] | undefined): ChipSpec[] {
  const out: ChipSpec[] = [];
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
      dot: match ? spaceTone(match.color).dot : c.ink3,
      kinds: ["space"],
    });
  }
  if (parsed.date || parsed.time !== undefined) {
    const day = parsed.date ? formatDay(parsed.date, today) : "";
    const time = parsed.time !== undefined ? formatClock(parsed.time) : "";
    out.push({
      key: "when",
      label: [day, time].filter(Boolean).join(", "),
      icon: CalendarDays,
      kinds: ["date", "time"],
    });
  }
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

export const QuickAdd = forwardRef<QuickAddHandle, Props>(function QuickAdd(
  { variant, defaultDate, autoFocus, onAdded, placeholder = "Add a task, like “essay fri 5pm every week”" },
  ref,
) {
  const { today } = useClock();
  const spaces = useSpaces();
  const addText = useMutation(api.tasks.addText);
  const phone = useIsPhone();
  const roles = useType();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  const parsed = useMemo(() => parseTask(text, today), [text, today]);
  const chips = useMemo(() => chipsFor(parsed, today, spaces), [parsed, today, spaces]);

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await addText({ text: value, ...(defaultDate && !parsed.date ? { date: defaultDate } : {}) });
      const where = parsed.date
        ? formatDay(parsed.date, today)
        : defaultDate
          ? formatDay(defaultDate, today)
          : parsed.spaceName
            ? (findSpace(spaces, parsed.spaceName)?.name ?? parsed.spaceName)
            : "Inbox";
      showToast(`Added to ${where}: ${parsed.title || value}`);
      if (parsed.reminders.length || parsed.time !== undefined) void ensureNotifications();
      setText("");
      onAdded?.();
    } catch (e) {
      showToast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const field = (
    <TextInput
      ref={input}
      value={text}
      onChangeText={setText}
      onSubmitEditing={() => void submit()}
      submitBehavior="submit"
      returnKeyType="done"
      autoFocus={autoFocus}
      placeholder={placeholder}
      placeholderTextColor={hex.ink3}
      accessibilityLabel="Add a task"
      autoCapitalize="sentences"
      onKeyPress={(e) => {
        if (Platform.OS === "web" && e.nativeEvent.key === "Escape") {
          setText("");
          input.current?.blur();
        }
      }}
      style={[
        roles.body,
        { flex: 1, minWidth: 0, color: c.ink, padding: 0, height: variant === "inline" ? "100%" : 48 },
        Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
      ]}
    />
  );

  const highlight =
    parsed.spans.length > 0 ? (
      <Txt variant="meta" tone="ink3" numberOfLines={2} accessibilityLabel={`Understood: ${parsed.title}`}>
        {segments(text, parsed).map((seg, i) =>
          seg.kind ? (
            <Txt key={i} variant="meta" tone="ink" style={{ backgroundColor: c.select, borderRadius: r.sm }}>
              {seg.text}
            </Txt>
          ) : (
            <Txt key={i} variant="meta" tone="ink3">
              {seg.text}
            </Txt>
          ),
        )}
      </Txt>
    ) : null;

  const chipRow = chips.length ? (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          icon={chip.icon}
          leading={chip.dot ? <Dot color={chip.dot} /> : undefined}
          onRemove={() => setText(without(text, parsed, chip.kinds))}
          accessibilityLabel={`Remove ${chip.label}`}
        />
      ))}
    </View>
  ) : null;

  if (variant === "inline") {
    return (
      <View style={{ gap: s.s3 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s.s3,
            height: 44,
            paddingLeft: s.s4,
            paddingRight: s.s3,
            borderRadius: r.card,
            backgroundColor: c.raised,
            boxShadow: shadows.raised,
          }}
        >
          <Icon icon={Plus} />
          {field}
          {text ? null : (
            <Txt variant="caption" tone="ink3">
              N
            </Txt>
          )}
        </View>
        {text ? (
          <View style={{ gap: s.s2, paddingHorizontal: s.s1 }}>
            {highlight}
            {chipRow}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: s.s3 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          paddingHorizontal: s.s3,
          borderRadius: r.ctl,
          backgroundColor: c.sunken,
          boxShadow: `inset 0 0 0 1px ${c.line}`,
        }}
      >
        {field}
      </View>
      {highlight}
      {chipRow}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s.s2 }}>
        <Button
          variant="primary"
          label="Add task"
          icon={Plus}
          onPress={() => void submit()}
          disabled={!text.trim() || busy}
          style={phone ? { height: 48 } : undefined}
        />
      </View>
    </View>
  );
});

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

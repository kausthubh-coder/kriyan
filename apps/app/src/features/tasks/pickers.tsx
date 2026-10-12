// Choosing a day, a time, a length, a space. Each is plain content that sits in a Popover
// (desktop and list rows) or inline in the task sheet (phones).

import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react-native";
import { addDays, addMonths, daysInMonth, fromParts, parts, weekday, type CivilDate } from "@kriyan/core/dates";
import { formatDay, MONTH_SHORT } from "@kriyan/core/format";
import { parseClock } from "@kriyan/core/parse";
import { useSpaces } from "@/data/views";
import { useControl, useIsPhone } from "@/theme/layout";
import { c, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Dot, Field } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

/** One choice in a list: icon or dot, label, an optional quiet hint. */
export function Option({
  label,
  hint,
  onPress,
  selected,
  leading,
  indent = 0,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  selected?: boolean;
  leading?: ReactNode;
  indent?: number;
}) {
  const { row } = useControl();
  return (
    <Press
      role="menuitem"
      aria-selected={selected}
      onPress={onPress}
      scale={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        minHeight: row,
        paddingLeft: s.s2 + indent * s.s4,
        paddingRight: s.s2,
        borderRadius: r.ctl,
        backgroundColor: selected ? c.select : "transparent",
      }}
    >
      {leading}
      <Txt variant="body" tone={selected ? "ink" : "ink2"} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Txt>
      {hint ? (
        <Txt variant="meta" tone="ink3">
          {hint}
        </Txt>
      ) : null}
    </Press>
  );
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Quick days and a month calendar. `null` means no date. */
export function DayPicker({
  value,
  today,
  onPick,
  allowNone = true,
}: {
  value: CivilDate | null;
  today: CivilDate;
  onPick: (date: CivilDate | null) => void;
  allowNone?: boolean;
}) {
  const phone = useIsPhone();
  const [ty, tm] = parts(value ?? today);
  const [month, setMonth] = useState<[number, number]>([ty, tm]);
  const cell = phone ? 44 : 32;
  const first = fromParts(month[0], month[1], 1);
  const lead = weekday(first);
  const count = daysInMonth(month[0], month[1]);
  const cells: (CivilDate | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: count }, (_, i) => fromParts(month[0], month[1], i + 1))];
  while (cells.length % 7) cells.push(null);
  const saturday = addDays(today, (5 - weekday(today) + 7) % 7);
  const nextMonday = addDays(today, 7 - weekday(today));

  const quick: [string, CivilDate][] = [
    ["Today", today],
    ["Tomorrow", addDays(today, 1)],
    ["This weekend", saturday],
    ["Next week", nextMonday],
  ];

  return (
    <View style={{ gap: s.s3 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {quick.map(([label, date]) => (
          <Chip key={label} label={label} on={value === date} onPress={() => onPick(date)} accessibilityLabel={`${label}, ${formatDay(date, today)}`} />
        ))}
        {allowNone ? <Chip label="No date" on={value === null} onPress={() => onPick(null)} /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Txt variant="label" style={{ flex: 1 }}>
          {MONTH_SHORT[month[1] - 1]} {month[0]}
        </Txt>
        <Button icon={ChevronLeft} accessibilityLabel="Previous month" onPress={() => setMonth(addMonths(month[0], month[1], -1))} />
        <Button icon={ChevronRight} accessibilityLabel="Next month" onPress={() => setMonth(addMonths(month[0], month[1], 1))} />
      </View>
      <View>
        <View style={{ flexDirection: "row" }}>
          {DAY_LETTERS.map((d, i) => (
            <Txt key={i} variant="caption" tone="ink3" style={{ flex: 1, textAlign: "center" }} accessibilityLabel={DAY_NAMES[i]}>
              {d}
            </Txt>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <View key={w} style={{ flexDirection: "row" }}>
            {cells.slice(w * 7, w * 7 + 7).map((date, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                {date ? (
                  <Press
                    role="button"
                    accessibilityLabel={formatDay(date, today)}
                    aria-selected={date === value}
                    onPress={() => onPick(date)}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: r.ctl,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: date === value ? c.ink : "transparent",
                    }}
                  >
                    <Txt variant={date === today ? "label" : "body"} tone={date === value ? "onInk" : date === today ? "now" : date < today ? "ink3" : "ink2"} tnum>
                      {parts(date)[2]}
                    </Txt>
                  </Press>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A time typed like "14:30" or "2pm", with common times as chips. */
export function TimePicker({ value, onPick }: { value: number | null; onPick: (minutes: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`);
  const parsed = text.trim() ? parseClock(text.trim()) : null;
  const common = [9 * 60, 12 * 60, 14 * 60, 17 * 60, 19 * 60];
  return (
    <View style={{ gap: s.s3 }}>
      <Field
        label="Time"
        value={text}
        onChangeText={setText}
        placeholder="14:30 or 2pm"
        autoFocus
        onSubmitEditing={() => parsed !== null && onPick(parsed)}
        returnKeyType="done"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {common.map((m) => (
          <Chip key={m} label={`${String(m / 60).padStart(2, "0")}:00`} on={value === m} onPress={() => onPick(m)} />
        ))}
        <Chip label="No time" on={value === null} onPress={() => onPick(null)} />
      </View>
      {text.trim() ? (
        <Button
          variant="primary"
          label={parsed === null ? "Type a time like 14:30" : "Set time"}
          disabled={parsed === null}
          onPress={() => parsed !== null && onPick(parsed)}
        />
      ) : null}
    </View>
  );
}

/** The person's spaces as a tree, plus "No space" (the Inbox). */
export function SpacePicker({ value, onPick, allowNone = true }: { value: string | null; onPick: (spaceId: string | null) => void; allowNone?: boolean }) {
  const spaces = useSpaces();
  return (
    <View role="menu" style={{ gap: 2 }}>
      {allowNone ? <Option label="No space (Inbox)" leading={<Icon icon={Inbox} size={16} />} selected={value === null} onPress={() => onPick(null)} /> : null}
      {(spaces ?? []).map((sp) => (
        <Option
          key={sp._id}
          label={sp.name}
          indent={sp.depth}
          selected={value === sp._id}
          leading={
            <View style={{ width: 16, alignItems: "center" }}>
              <Dot color={spaceTone(sp.color).dot} />
            </View>
          }
          onPress={() => onPick(sp._id)}
        />
      ))}
      {spaces && spaces.length === 0 ? (
        <Txt variant="meta" tone="ink3" style={{ padding: s.s2 }}>
          You have no spaces yet. Type #name in quick add to make one.
        </Txt>
      ) : null}
    </View>
  );
}

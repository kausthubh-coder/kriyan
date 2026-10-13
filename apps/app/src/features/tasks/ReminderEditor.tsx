// Any number of reminders: one tap for the common ones, or type your own ("45 min before",
// "day before at 18:00", "at 8am").

import { useState } from "react";
import { View } from "react-native";
import { Bell, X } from "lucide-react-native";
import { describeReminder } from "@kriyan/core/format";
import { parseTask } from "@kriyan/core/parse";
import { sameReminder, type Reminder } from "@kriyan/core/reminders";
import { useControl } from "@/theme/layout";
import { r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Field } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

const QUICK_TIMED: Reminder[] = [
  { kind: "before", minutes: 0 },
  { kind: "before", minutes: 10 },
  { kind: "before", minutes: 30 },
  { kind: "before", minutes: 60 },
  { kind: "day", offset: -1, time: 20 * 60 },
];
const QUICK_DAY: Reminder[] = [
  { kind: "day", offset: 0, time: 9 * 60 },
  { kind: "day", offset: 0, time: 18 * 60 },
  { kind: "day", offset: -1, time: 20 * 60 },
  { kind: "before", minutes: 2 * 1440 },
];

export function ReminderEditor({
  reminders,
  timed,
  onChange,
}: {
  reminders: Reminder[];
  timed: boolean;
  onChange: (next: Reminder[]) => void;
}) {
  const { row } = useControl();
  const [text, setText] = useState("");
  const custom = text.trim()
    ? (parseTask(`x remind ${text.trim()}`, "2026-01-01").reminders[0] ?? null)
    : null;
  const add = (rem: Reminder) => {
    if (reminders.some((x) => sameReminder(x, rem))) return;
    onChange([...reminders, rem]);
  };
  return (
    <View style={{ gap: s.s3 }}>
      {reminders.length ? (
        <View>
          {reminders.map((rem, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: row }}>
              <Icon icon={Bell} size={16} />
              <Txt variant="body" style={{ flex: 1 }}>
                {describeReminder(rem)}
              </Txt>
              <Button
                icon={X}
                accessibilityLabel={`Remove reminder: ${describeReminder(rem)}`}
                onPress={() => onChange(reminders.filter((_, k) => k !== i))}
              />
            </View>
          ))}
        </View>
      ) : (
        <Txt variant="meta" tone="ink3">
          No reminders yet.
        </Txt>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {(timed ? QUICK_TIMED : QUICK_DAY)
          .filter((q) => !reminders.some((x) => sameReminder(x, q)))
          .map((q) => (
            <Chip
              key={describeReminder(q)}
              label={describeReminder(q)}
              onPress={() => add(q)}
              accessibilityLabel={`Add reminder: ${describeReminder(q)}`}
            />
          ))}
      </View>
      <Field
        label="Custom reminder"
        value={text}
        onChangeText={setText}
        placeholder="45 min before, day before at 18:00"
        onSubmitEditing={() => {
          if (custom) {
            add(custom);
            setText("");
          }
        }}
        trailing={
          text.trim() ? (
            <Press
              role="button"
              accessibilityLabel={custom ? `Add reminder: ${describeReminder(custom)}` : "Not a reminder yet"}
              disabled={!custom}
              onPress={() => {
                if (custom) {
                  add(custom);
                  setText("");
                }
              }}
              style={{ paddingHorizontal: s.s2, height: 28, justifyContent: "center", borderRadius: r.sm }}
            >
              <Txt variant="label" tone={custom ? "ink" : "ink3"}>
                {custom ? `Add ${describeReminder(custom).toLowerCase()}` : "Not a reminder yet"}
              </Txt>
            </Press>
          ) : null
        }
      />
    </View>
  );
}

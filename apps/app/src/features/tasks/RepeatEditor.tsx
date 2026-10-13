// One interface for every repeat (task.html): a text field parsed as you type, presets,
// custom (every N days, weeks, months, years; weekdays; monthly by day, last day or nth
// weekday), ends, repeats from, and always the next five dates.

import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { Check, Info, Repeat2 } from "lucide-react-native";
import { parts, weekday, type CivilDate, type Weekday } from "@kriyan/core/dates";
import { describeRepeat, formatDate, formatTimeRange, MONTH_SHORT, repeatPhrase, WEEKDAY_LONG } from "@kriyan/core/format";
import { parseTask } from "@kriyan/core/parse";
import { occurrences, validateRepeat, type MonthlyRule, type Repeat } from "@kriyan/core/repeat";
import { useControl, useIsPhone, useType } from "@/theme/layout";
import { c, hex, r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Field } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Select, SelectButton } from "@/ui/Select";
import { Txt } from "@/ui/Txt";
import { DayPicker } from "./pickers";

interface Props {
  rule: Repeat | null;
  /** The occurrence the rule is anchored on (the task's date, or today). */
  first: CivilDate;
  time: number | null;
  length: number | null;
  today: CivilDate;
  onSave: (rule: Repeat | null) => void;
  onCancel: () => void;
}

const ORD = ["", "first", "second", "third", "fourth"];
const DAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"];

function same(a: Repeat | null, b: Repeat | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ordinal(n: number) {
  const s2 = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s2}`;
}

export function RepeatEditor({ rule, first, time, length, today, onSave, onCancel }: Props) {
  const phone = useIsPhone();
  const roles = useType();
  const { ctl } = useControl();
  const [draft, setDraft] = useState<Repeat>(rule ?? { freq: "week", interval: 1, weekdays: [weekday(first)] });
  const [text, setText] = useState(rule ? repeatPhrase(rule, first) : "");
  const [textError, setTextError] = useState(false);
  const [pickEnd, setPickEnd] = useState(false);

  const wd = weekday(first);
  const [, fm, fd] = parts(first);
  const nthOfMonth = Math.ceil(fd / 7);
  const isLastWeek = fd + 7 > new Date(Date.UTC(parts(first)[0], fm, 0)).getUTCDate();

  const presets: { label: string; rule: Repeat }[] = [
    { label: "Every day", rule: { freq: "day", interval: 1 } },
    { label: "Weekdays", rule: { freq: "week", interval: 1, weekdays: [0, 1, 2, 3, 4] } },
    { label: `Weekly on ${WEEKDAY_LONG[wd]}`, rule: { freq: "week", interval: 1, weekdays: [wd] } },
    { label: `Monthly on the ${ordinal(fd)}`, rule: { freq: "month", interval: 1, monthly: { kind: "day", day: fd } } },
    { label: "Last day of the month", rule: { freq: "month", interval: 1, monthly: { kind: "last" } } },
    { label: `Every year on ${fd} ${MONTH_SHORT[fm - 1]}`, rule: { freq: "year", interval: 1 } },
  ];
  const core = (x: Repeat): Repeat => {
    const { end: _end, fromCompletion: _fc, ...rest } = x;
    return rest;
  };

  const set = (next: Repeat) => {
    setDraft(next);
    setText(repeatPhrase(next, first));
    setTextError(false);
  };

  const onText = (value: string) => {
    setText(value);
    if (!value.trim()) return;
    const parsed = parseTask(`x ${value}`, today).repeat;
    if (parsed) {
      setDraft(parsed);
      setTextError(false);
    } else setTextError(true);
  };

  const problem = validateRepeat(draft);
  const next = useMemo(() => {
    if (problem) return [];
    const out: CivilDate[] = [];
    for (const d of occurrences(draft, first)) {
      if (d < today) continue;
      out.push(d);
      if (out.length === 5) break;
    }
    return out;
  }, [draft, first, today, problem]);

  const monthlyOptions: { value: string; label: string; rule: MonthlyRule }[] = [
    { value: "day", label: `on day ${fd}`, rule: { kind: "day", day: fd } },
    ...(nthOfMonth <= 4 ? [{ value: "nth", label: `on the ${ORD[nthOfMonth]} ${WEEKDAY_LONG[wd]}`, rule: { kind: "nth", n: nthOfMonth as 1 | 2 | 3 | 4, weekday: wd } as MonthlyRule }] : []),
    ...(isLastWeek ? [{ value: "lastwd", label: `on the last ${WEEKDAY_LONG[wd]}`, rule: { kind: "nth", n: -1, weekday: wd } as MonthlyRule }] : []),
    { value: "last", label: "on the last day", rule: { kind: "last" } },
  ];
  const monthlyValue =
    draft.monthly?.kind === "last" ? "last" : draft.monthly?.kind === "nth" ? (draft.monthly.n === -1 ? "lastwd" : "nth") : "day";
  const shortMonths = draft.freq === "month" && (draft.monthly?.kind ?? "day") === "day" && (draft.monthly?.kind === "day" ? draft.monthly.day : fd) > 28;
  const endKind = draft.end?.kind ?? "never";

  return (
    <View style={{ gap: s.s3 }}>
      <Field
        label="Repeat rule"
        icon={Repeat2}
        value={text}
        onChangeText={onText}
        placeholder="every tue and thu, every last fri"
        autoCapitalize="none"
        containerStyle={{ backgroundColor: c.bg }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, paddingHorizontal: s.s1 }}>
        <Icon icon={textError ? Info : Check} size={14} />
        <Txt variant="meta" tone="ink2" style={{ flex: 1 }}>
          {textError ? "Not a rule yet. Try “every 2 weeks on mon” or “every last fri”." : describeRepeat(draft, first, today)}
        </Txt>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {presets.map((p) => (
          <Chip key={p.label} label={p.label} on={same(core(draft), core(p.rule))} onPress={() => set({ ...p.rule, ...(draft.end ? { end: draft.end } : {}), ...(draft.fromCompletion ? { fromCompletion: true } : {}) })} />
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: s.s2 }}>
        <Txt variant="body" tone="ink2">
          Every
        </Txt>
        <TextInput
          accessibilityLabel="Interval"
          value={String(draft.interval)}
          keyboardType="number-pad"
          onChangeText={(v) => {
            const n = Number(v.replace(/\D/g, ""));
            if (n >= 1 && n <= 999) set({ ...draft, interval: n });
          }}
          style={[
            roles.body,
            { width: phone ? 48 : 44, height: ctl, textAlign: "center", color: c.ink, borderRadius: r.ctl, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, padding: 0 },
          ]}
          selectionColor={hex.ink2}
        />
        <Select
          label="Unit"
          value={draft.freq}
          options={[
            { value: "day", label: draft.interval === 1 ? "day" : "days" },
            { value: "week", label: draft.interval === 1 ? "week" : "weeks" },
            { value: "month", label: draft.interval === 1 ? "month" : "months" },
            { value: "year", label: draft.interval === 1 ? "year" : "years" },
          ]}
          onChange={(freq) =>
            set({
              freq,
              interval: draft.interval,
              ...(freq === "week" ? { weekdays: [wd] } : {}),
              ...(freq === "month" ? { monthly: { kind: "day", day: fd } as MonthlyRule } : {}),
              ...(draft.end ? { end: draft.end } : {}),
              ...(draft.fromCompletion ? { fromCompletion: true } : {}),
            })
          }
        />
        {draft.freq === "week" ? (
          <Txt variant="body" tone="ink2">
            on
          </Txt>
        ) : null}
        {draft.freq === "year" ? (
          <Txt variant="body" tone="ink2">
            on {fd} {MONTH_SHORT[fm - 1]}
          </Txt>
        ) : null}
      </View>

      {draft.freq === "week" ? (
        <View style={{ flexDirection: "row", gap: s.s1 }}>
          {DAY_LETTER.map((letter, i) => {
            const on = (draft.weekdays ?? [wd]).includes(i as Weekday);
            return (
              <Press
                key={i}
                role="button"
                aria-pressed={on}
                accessibilityLabel={WEEKDAY_LONG[i]}
                onPress={() => {
                  const days = new Set(draft.weekdays ?? [wd]);
                  if (on) days.delete(i as Weekday);
                  else days.add(i as Weekday);
                  if (days.size) set({ ...draft, weekdays: [...days].sort((a, b) => a - b) });
                }}
                hoverBg={on ? null : c.hover}
                style={{ flex: 1, height: phone ? 44 : 32, borderRadius: r.ctl, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : c.bg }}
              >
                <Txt variant="label" style={{ fontSize: 12, lineHeight: 16 }} tone={on ? "onInk" : "ink3"}>
                  {letter}
                </Txt>
              </Press>
            );
          })}
        </View>
      ) : null}

      {draft.freq === "month" ? (
        <Select
          label="Day of the month"
          value={monthlyValue}
          options={monthlyOptions.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => {
            const option = monthlyOptions.find((o) => o.value === v);
            if (option) set({ ...draft, monthly: option.rule });
          }}
        />
      ) : null}
      {shortMonths ? (
        <Txt variant="meta" tone="ink3">
          In months without a {ordinal(draft.monthly?.kind === "day" ? draft.monthly.day : fd)}, it falls on the last day.
        </Txt>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: s.s2 }}>
        <Txt variant="body" tone="ink2" style={{ lineHeight: ctl }}>
          Ends
        </Txt>
        <Select
          label="Ends"
          value={endKind}
          options={[
            { value: "never", label: "never" },
            { value: "on", label: "on a date" },
            { value: "count", label: "after" },
          ]}
          onChange={(kind) => {
            const { end: _e, ...rest } = draft;
            if (kind === "never") set(rest);
            else if (kind === "on") set({ ...rest, end: { kind: "on", date: next[4] ?? first } });
            else set({ ...rest, end: { kind: "count", count: 10 } });
          }}
        />
        {draft.end?.kind === "on" ? <SelectButton text={formatDate(draft.end.date, today)} label="End date" onPress={() => setPickEnd(!pickEnd)} expanded={pickEnd} /> : null}
        {draft.end?.kind === "count" ? (
          <>
            <TextInput
              accessibilityLabel="Number of times"
              value={String(draft.end.count)}
              keyboardType="number-pad"
              onChangeText={(v) => {
                const n = Number(v.replace(/\D/g, ""));
                if (n >= 1) set({ ...draft, end: { kind: "count", count: n } });
              }}
              style={[roles.body, { width: 56, height: ctl, textAlign: "center", color: c.ink, borderRadius: r.ctl, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, padding: 0 }]}
            />
            <Txt variant="body" tone="ink2" style={{ lineHeight: ctl }}>
              times
            </Txt>
          </>
        ) : null}
      </View>
      {pickEnd && draft.end?.kind === "on" ? (
        <View style={{ padding: s.s3, borderRadius: r.ctl, backgroundColor: c.bg }}>
          <DayPicker
            value={draft.end.date}
            today={today}
            allowNone={false}
            onPick={(date) => {
              if (date) set({ ...draft, end: { kind: "on", date } });
              setPickEnd(false);
            }}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: s.s2 }}>
        <Txt variant="body" tone="ink2" style={{ lineHeight: ctl }}>
          Repeats from
        </Txt>
        <Select
          label="Repeats from"
          value={draft.fromCompletion ? "done" : "schedule"}
          options={[
            { value: "schedule", label: "the schedule" },
            { value: "done", label: "when I finish it" },
          ]}
          onChange={(v) => {
            const { fromCompletion: _f, ...rest } = draft;
            set(v === "done" ? { ...rest, fromCompletion: true } : rest);
          }}
        />
      </View>

      <View aria-label="Next five dates" style={{ gap: s.s1, padding: s.s3, borderRadius: r.ctl, backgroundColor: c.bg }}>
        <Txt variant="caption" tone="ink3">
          {draft.fromCompletion ? "Next five, if you finish each on its day" : "Next five"}
        </Txt>
        {problem ? (
          <Txt variant="meta" tone="ink2">
            {problem}
          </Txt>
        ) : next.length === 0 ? (
          <Txt variant="meta" tone="ink2">
            This rule has no dates left. Change when it ends.
          </Txt>
        ) : (
          next.map((d) => (
            <View key={d} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt variant="meta" tone="ink2" tnum>
                {formatDate(d, today)}
              </Txt>
              <Txt variant="meta" tone="ink3" tnum>
                {time !== null ? formatTimeRange(time, length ?? undefined) : "Any time"}
              </Txt>
            </View>
          ))
        )}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s.s2 }}>
        {rule ? <Button variant="quiet" label="Remove repeat" onPress={() => onSave(null)} style={{ marginRight: "auto" }} /> : null}
        <Button label="Cancel" onPress={onCancel} />
        <Button variant="primary" label="Save repeat" onPress={() => onSave(draft)} disabled={Boolean(problem) || textError} />
      </View>
    </View>
  );
}

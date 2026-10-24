// The person's own first day as onboarding builds it: wake up, their first task, wind down, and
// the one-sentence summary Today opens with (onboarding.html dayRows and personalSentence).

import type { ReactNode } from "react";
import { View } from "react-native";
import { Moon, Plus, Repeat2, Square, Sun } from "lucide-react-native";
import { formatClock, parts, weekday, type CivilDate } from "@kriyan/core/dates";
import { describeRepeat, formatDate, formatDuration, MONTH_LONG, WEEKDAY_SHORT } from "@kriyan/core/format";
import { parseTask, type ParsedTask } from "@kriyan/core/parse";
import { useClock } from "@/data/time";
import { c, r, s, shadows, spaceTone } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Txt } from "@/ui/Txt";
import type { Draft } from "./draft";

/** The first task, parsed the way the server will, and whether it lands today. */
export function firstTask(d: Draft, today: CivilDate): { parsed: ParsedTask; isToday: boolean } | null {
  if (!d.task) return null;
  const parsed = parseTask(d.task.text, d.task.date);
  return { parsed, isToday: !parsed.date || parsed.date === today };
}

function greeting(now: number): string {
  return now < 12 * 60 ? "Good morning" : now < 18 * 60 ? "Good afternoon" : "Good evening";
}

/** The sentence as pieces in two tones: true is a dim word, false a word that matters. */
function sentence(d: Draft, today: CivilDate, name: string | null, now: number): [string, boolean][] {
  const hello: [string, boolean][] = name
    ? [
        [`${greeting(now)}, `, true],
        [`${name}. `, false],
      ]
    : [];
  const f = firstTask(d, today);
  if (!f)
    return [
      ...hello,
      ["Your day runs ", true],
      [formatClock(d.wake), false],
      [" to ", true],
      [formatClock(d.wind), false],
      [". What's first?", true],
    ];
  const p = f.parsed;
  if (!f.isToday && p.date)
    return [
      ...hello,
      ["Today is ", true],
      ["open", false],
      [". ", true],
      [p.title, false],
      [` is on ${formatDate(p.date, today)}.`, true],
    ];
  const when: [string, boolean][] =
    p.time !== undefined
      ? [
          [" at ", true],
          [formatClock(p.time), false],
          [". You're ", true],
          ["mostly free", false],
          [" until then.", true],
        ]
      : [[", any time you like.", true]];
  return [...hello, ["You have ", true], ["1 task", false], [" today: ", true], [p.title, false], ...when];
}

export function PersonalSentence({
  d,
  today,
  name = null,
  onHead = true,
}: {
  d: Draft;
  today: CivilDate;
  name?: string | null;
  onHead?: boolean;
}) {
  const { now } = useClock();
  return (
    <Txt variant="title">
      {sentence(d, today, name, now).map(([text, dim], i) => (
        <Txt key={i} variant="title" tone={onHead ? (dim ? "headDim" : "headInk") : dim ? "ink3" : "ink"}>
          {text}
        </Txt>
      ))}
    </Txt>
  );
}

/** "Sat" with the red dot, and the date on the right (the Today header's top line). */
export function DayName({ today, big }: { today: CivilDate; big?: boolean }) {
  const [y, m, day] = parts(today);
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s1 }}>
        <Txt variant={big ? "display" : "headline"} tone="headInk">
          {WEEKDAY_SHORT[weekday(today)]}
        </Txt>
        <View
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.now, marginTop: big ? 12 : 8 }}
        />
      </View>
      <Txt variant="label" tone="headDim" style={{ textAlign: "right" }}>
        {`${day} ${MONTH_LONG[m - 1]}\n${y}`}
      </Txt>
    </View>
  );
}

function Row({
  icon,
  iconColor,
  title,
  meta,
  time,
  until,
  ghost,
}: {
  icon: typeof Sun;
  iconColor?: string;
  title: string;
  meta?: string;
  time: string;
  until?: string;
  ghost?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        minHeight: 48,
        paddingVertical: s.s2,
        borderBottomWidth: 1,
        borderStyle: ghost ? "dashed" : "dotted",
        borderColor: c.lineStrong,
      }}
    >
      <Icon icon={icon} size={20} tone={ghost ? "parse" : "ink2"} color={iconColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" tone={ghost ? "ink3" : "ink"} numberOfLines={1}>
          {title}
        </Txt>
        {meta ? (
          <Txt variant="meta" tone="ink3" numberOfLines={1}>
            {meta}
          </Txt>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Txt variant="meta" tone={ghost ? "parse" : "ink3"} tnum>
          {time}
        </Txt>
        {until ? (
          <Txt variant="caption" tone="ink3" tnum>
            {until}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The day so far, in time order. `pending` is what's being typed: it shows dashed, "Lands
 * here when you add it". A first task on another day shows as a line under the day.
 */
export function DayRows({ d, today, pending }: { d: Draft; today: CivilDate; pending?: ParsedTask }) {
  const f = firstTask(d, today);
  const rows: { at: number; node: ReactNode }[] = [
    { at: d.wake, node: <Row key="wake" icon={Sun} title="Wake up" time={formatClock(d.wake)} /> },
    {
      at: d.wind,
      node: (
        <Row
          key="wind"
          icon={Moon}
          iconColor={spaceTone("purple").dotHex}
          title="Wind down"
          time={formatClock(d.wind)}
        />
      ),
    },
  ];
  if (f?.isToday) {
    const p = f.parsed;
    const meta = [
      p.length ? formatDuration(p.length) : "",
      p.repeat ? describeRepeat(p.repeat, p.date ?? today, today) : "",
    ]
      .filter(Boolean)
      .join(", ");
    rows.push({
      at: p.time ?? d.wake + 1,
      node: (
        <Row
          key="task"
          icon={p.repeat ? Repeat2 : Square}
          title={p.title || "Your first thing"}
          meta={meta || undefined}
          time={p.time !== undefined ? formatClock(p.time) : "Anytime"}
          until={p.time !== undefined && p.length ? formatClock(p.time + p.length) : undefined}
        />
      ),
    });
  }
  if (pending?.title && (!pending.date || pending.date === today))
    rows.push({
      at: pending.time ?? d.wake + 1,
      node: (
        <Row
          key="pending"
          icon={Plus}
          title={pending.title}
          meta="Lands here when you add it"
          time={pending.time !== undefined ? formatClock(pending.time) : "Anytime"}
          ghost
        />
      ),
    });
  rows.sort((a, b) => a.at - b.at);
  const elsewhere = f && !f.isToday && f.parsed.date ? f.parsed : null;
  return (
    <View>
      {rows.map((row) => row.node)}
      {elsewhere?.date ? (
        <View style={{ minHeight: 40, justifyContent: "center", paddingLeft: s.s8 }}>
          <Txt variant="meta" tone="ink3">
            {`${elsewhere.title} is on ${formatDate(elsewhere.date, today)}${
              elsewhere.time !== undefined ? `, ${formatClock(elsewhere.time)}` : ""
            }`}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/** Desktop only: the day as Today will show it, updating with every answer (`.live`). */
export function LivePreview({ d, today, note }: { d: Draft; today: CivilDate; note: string }) {
  return (
    <View style={{ width: 460, gap: s.s3 }} aria-label="Live preview of your day">
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.now }} />
        <Txt variant="caption" tone="ink3">
          Your day, live
        </Txt>
      </View>
      <View
        style={{
          borderRadius: r.sheet,
          overflow: "hidden",
          backgroundColor: c.raised,
          boxShadow: shadows.overlay,
        }}
      >
        <View style={{ backgroundColor: c.head, padding: s.s6, gap: s.s4 }}>
          <DayName today={today} />
          <PersonalSentence d={d} today={today} />
        </View>
        <View style={{ paddingHorizontal: s.s6, paddingTop: s.s1, paddingBottom: s.s4 }}>
          <DayRows d={d} today={today} />
        </View>
      </View>
      <Txt variant="body" tone="ink3" style={{ maxWidth: 400 }}>
        {note}
      </Txt>
    </View>
  );
}

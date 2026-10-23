// The phone's day as a spine (b2.html `.tl`): start and end times on the left, a pill per item
// on a dotted line, the title with its times, and a ring to tick it off. Free stretches of half
// an hour or more offer adding a task there; the now line sits between what's done and what's
// next. Desktop keeps the hour grid (Timeline.tsx), where dragging blocks makes sense.

import type { ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { CalendarDays, Check as CheckIcon, Plus, Sparkles, Square, Sun } from "lucide-react-native";
import { formatClock } from "@kriyan/core/dates";
import { formatDuration, formatTimeRange } from "@kriyan/core/format";
import { type } from "@kriyan/core/tokens";
import type { TaskView } from "@/data/views";
import { completeTask, reopenTask, ticking } from "@/features/tasks/actions";
import { openTask } from "@/features/tasks/TaskRow";
import { roleStyle } from "@/theme/layout";
import { c, hex, r, s, spaceTone, sz } from "@/theme/tokens";
import { Check } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

const TIME_W = 48;
const PILL_COL = 56;
const PILL_W = 44;
/** Where the title starts: the time and pill columns, the gaps between them, the body's inset. */
const BODY_X = TIME_W + s.s1 + PILL_COL + s.s1 + s.s2;
/** A free stretch shorter than this isn't worth offering. */
const MIN_GAP = 30;
// The prototype's small type (12 and 14) on phones, where the meta and body roles grow.
const small = roleStyle(type.meta);
const body14 = roleStyle(type.body);

interface Props {
  /** The day's date, for adding a task into a free stretch. */
  date: string;
  /** The day's timed items. */
  items: TaskView[];
  /** Minutes now when the day is today, else null (no now line, every gap offered). */
  now: number | null;
}

/** Opens quick add for a free stretch. The add route reads `date` and `time` once it supports them. */
function addAt(date: string, minutes: number) {
  router.push(`/add?date=${date}&time=${formatClock(minutes)}`);
}

export function Spine({ date, items, now }: Props) {
  const ticked = ticking.useValue((t) => t);
  const timed = items
    .filter((t): t is TaskView & { time: number } => t.time !== null)
    .sort((a, b) => a.time - b.time);

  const rows: ReactNode[] = [];
  let prevEnd: number | null = null;
  let nowShown = now === null;
  for (const t of timed) {
    if (!nowShown && now !== null && t.time > now) {
      const ahead = t.time - now;
      rows.push(
        <NowLine
          key="now"
          now={now}
          note={ahead <= 20 && !t.event ? `task ahead, ${formatDuration(ahead)} to prep` : null}
        />,
      );
      nowShown = true;
      prevEnd = prevEnd !== null && prevEnd > now ? prevEnd : now;
    }
    // Today, only stretches still ahead are offered; a past gap can't be planned into.
    if (prevEnd !== null && (now === null || t.time > now) && t.time - prevEnd >= MIN_GAP) {
      rows.push(<Gap key={`gap-${prevEnd}`} start={prevEnd} minutes={t.time - prevEnd} date={date} />);
    }
    rows.push(
      <Item key={`${t._id}:${t.date}`} task={t} start={t.time} done={t.done || Boolean(ticked[t._id])} />,
    );
    const end = t.time + (t.length ?? 0);
    if (prevEnd === null || end > prevEnd) prevEnd = end;
  }
  if (!timed.length) {
    rows.push(
      <View key="empty" style={{ minHeight: sz.touch, justifyContent: "center", paddingLeft: BODY_X }}>
        <Txt tone="ink3" style={body14}>
          Nothing timed on this day yet
        </Txt>
      </View>,
    );
  }
  if (!nowShown && now !== null) rows.push(<NowLine key="now" now={now} note={null} />);

  return (
    <View aria-label="Schedule" style={{ position: "relative", gap: s.s1 }}>
      {/* The spine runs through the middle of the pill column, behind the pills. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: TIME_W + s.s1 + PILL_COL / 2 - 1,
          top: s.s2,
          bottom: s.s2,
          borderLeftWidth: 2,
          borderStyle: "dotted",
          borderColor: c.lineStrong,
        }}
      />
      {rows}
    </View>
  );
}

function Item({ task: t, start, done }: { task: TaskView; start: number; done: boolean }) {
  const tone = spaceTone(t.color);
  const end = t.length ? start + t.length : null;
  // The pill grows with the block's length, within reason, so a long lecture reads as long.
  const pillH = t.length ? Math.max(PILL_W, Math.min(130, t.length * 0.85)) : PILL_W;
  const meta =
    (end !== null
      ? `${formatClock(start)} → ${formatClock(end)} (${formatDuration(t.length ?? 0)})`
      : `${formatClock(start)} · no length`) +
    (t.repeat ? " ↻" : "") +
    (t.proposedBy ? ` · proposed by ${t.proposedBy}` : "");
  const outlined = t.event || Boolean(t.proposedBy);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: s.s1 }}>
      <Press
        role="button"
        accessibilityLabel={`Open ${t.title}, ${formatTimeRange(start, t.length ?? undefined)}`}
        onPress={() => openTask(t._id)}
        hoverBg={null}
        scale={false}
        style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: s.s1 }}
      >
        <View style={{ width: TIME_W, alignSelf: "flex-start", paddingTop: s.s1 }}>
          <Txt tone="ink3" tnum style={[small, { textAlign: "right" }]}>
            {formatClock(start)}
          </Txt>
          {end !== null ? (
            <Txt tone="ink3" tnum style={[small, { textAlign: "right" }]}>
              {formatClock(end)}
            </Txt>
          ) : null}
        </View>
        <View style={{ width: PILL_COL, alignItems: "center" }}>
          <View
            style={{
              width: PILL_W,
              height: pillH,
              borderRadius: r.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: done ? c.sunken : outlined ? (t.proposedBy ? c.bg : tone.surface) : tone.dot,
              borderWidth: !done && outlined ? 2 : 0,
              borderColor: tone.dot,
            }}
          >
            <Icon
              icon={done ? CheckIcon : t.proposedBy ? Sparkles : t.event ? CalendarDays : Square}
              size={18}
              color={done ? hex.ink3 : outlined ? tone.dotHex : hex.headInk}
            />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, paddingLeft: s.s2, paddingRight: s.s1 }}>
          <Txt tone="ink3" tnum numberOfLines={1} style={small}>
            {meta}
          </Txt>
          <Txt variant="subhead" tone={done ? "ink3" : "ink"} strike={done} numberOfLines={1}>
            {t.title}
          </Txt>
        </View>
      </Press>
      <View style={{ width: sz.touch, alignItems: "center" }}>
        {t.event ? null : (
          <Check
            round
            size={24}
            color={tone.dot}
            done={done}
            disabled={t.projected}
            label={`${done ? "Mark not done" : "Complete"}: ${t.title}`}
            onPress={() => (t.done ? !t.repeat && reopenTask(t._id) : !done && completeTask(t))}
          />
        )}
      </View>
    </View>
  );
}

function Gap({ start, minutes, date }: { start: number; minutes: number; date: string }) {
  const at = formatClock(start);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, paddingLeft: BODY_X }}>
      <Icon icon={Sun} size={16} />
      <Txt tone="ink3" tnum style={[body14, { flex: 1 }]}>
        {`${formatDuration(minutes)} free`}
      </Txt>
      <Press
        role="button"
        accessibilityLabel={`Add a task at ${at}`}
        onPress={() => addAt(date, start)}
        hoverBg={null}
        style={{ minHeight: sz.touch, justifyContent: "center" }}
      >
        {({ hovered }: { hovered?: boolean }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s.s1,
              height: sz.row,
              paddingHorizontal: s.s3,
              borderRadius: r.pill,
              backgroundColor: hovered ? c.select : c.sunken,
            }}
          >
            <Icon icon={Plus} size={16} tone="ink2" />
            <Txt tone="ink2" tnum style={roleStyle(type.label)}>
              {at}
            </Txt>
          </View>
        )}
      </Press>
    </View>
  );
}

function NowLine({ now, note }: { now: number; note: string | null }) {
  const label = `${formatClock(now)}${note ? ` · ${note}` : ""}`;
  return (
    <View style={{ minHeight: s.s8, justifyContent: "center" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: TIME_W + s.s1,
          right: 0,
          height: 1,
          backgroundColor: c.now,
        }}
      />
      <Txt
        variant="caption"
        tone="now"
        tnum
        numberOfLines={1}
        aria-label={`Now, ${formatClock(now)}`}
        style={{ alignSelf: "flex-start", marginLeft: BODY_X, paddingRight: s.s2, backgroundColor: c.bg }}
      >
        {label}
      </Txt>
    </View>
  );
}

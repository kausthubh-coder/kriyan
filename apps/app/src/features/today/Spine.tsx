// The day as a spine (b2.html `.tl`): start and end times on the left, a pill per item on a
// dotted line, the title with its times, and a ring to tick it off. Free stretches of half an
// hour or more offer adding a task there; the now line sits between what's done and what's
// next, and today's "Review today" card sits at the review time. Today's Timeline view on every
// width; the hour grid (Timeline.tsx), with dragging, is the desktop's right column.

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
import { dayRows } from "./dayRows";
import { ReviewCard } from "./ReviewCard";

const TIME_W = 48;
const PILL_COL = 56;
const PILL_W = 44;
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
  /** Free time today starts no earlier than the person's day. */
  dayStart?: number;
  /** Today's "Review today" card at the review time, or null for none. */
  reviewAt?: number | null;
}

/** Opens quick add with the stretch's day and time already in, understood. */
export function addAt(date: string, minutes: number) {
  router.push(`/add?date=${date}&time=${formatClock(minutes)}`);
}

export function Spine({ date, items, now, dayStart, reviewAt = null }: Props) {
  const ticked = ticking.useValue((t) => t);
  const rows: ReactNode[] = dayRows(items, { now, dayStart, reviewAt }).map((row) => {
    switch (row.kind) {
      case "task":
        return (
          <Item
            key={row.key}
            task={row.task}
            start={row.at}
            done={row.task.done || Boolean(ticked[row.task._id])}
          />
        );
      case "gap":
        return (
          <Indented key={row.key}>
            <FreeGap start={row.at} minutes={row.minutes} date={date} />
          </Indented>
        );
      case "now": {
        const next = row.next;
        const ahead = next?.time != null ? next.time - row.at : null;
        return (
          <NowLine
            key={row.key}
            now={row.at}
            note={
              ahead !== null && ahead <= 20 && !next?.event
                ? `task ahead, ${formatDuration(ahead)} to prep`
                : null
            }
          />
        );
      }
      case "review":
        return (
          // Over the pill column too, so the card has room for its line and button.
          <Indented key={row.key} flush wide>
            <ReviewCard at={row.at} />
          </Indented>
        );
    }
  });
  if (!items.some((t) => t.time !== null)) {
    rows.unshift(
      <Indented key="empty">
        <View style={{ minHeight: sz.touch, justifyContent: "center" }}>
          <Txt tone="ink3" style={body14}>
            Nothing timed on this day yet
          </Txt>
        </View>
      </Indented>,
    );
  }

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

/**
 * "1 h free  + 13:30" (b2.html `.gap`): a free stretch, with a button that opens quick add at
 * its start.
 */
export function FreeGap({ start, minutes, date }: { start: number; minutes: number; date: string }) {
  const at = formatClock(start);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
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
      <Indented>
        <Txt
          variant="caption"
          tone="now"
          tnum
          numberOfLines={1}
          aria-label={`Now, ${formatClock(now)}`}
          style={{ alignSelf: "flex-start", paddingRight: s.s2, backgroundColor: c.bg }}
        >
          {label}
        </Txt>
      </Indented>
    </View>
  );
}

/**
 * Lines a row up with the titles: empty time and pill columns, then the row. Columns rather than
 * one large padding, so every gap stays on the spacing scale. `flush` drops the title's inset;
 * `wide` starts at the pill column.
 */
function Indented({ children, flush, wide }: { children: ReactNode; flush?: boolean; wide?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1 }}>
      <View style={{ width: TIME_W }} />
      {wide ? null : <View style={{ width: PILL_COL }} />}
      <View style={{ flex: 1, minWidth: 0, paddingLeft: flush ? 0 : s.s2 }}>{children}</View>
    </View>
  );
}

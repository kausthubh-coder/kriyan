// Week: plan the week (b2.html `weekDesk`, `weekPhone`). Desktop: a tray of tasks not scheduled
// yet (Inbox, no date) beside seven day columns with a load line per day (planned against
// capacity), a dot for each deadline, birthday or task with no time (press a day to list them),
// and the time grid; drag from the tray onto a day or a time. Phones: the week strip over the picked day's spine, then what's still to plan.
// An agent's proposed blocks wait in a banner with Accept all and Discard. A full day is never
// red: red means now, and planning more than usual is the person's call, not a fault.

import { DottedRule } from "@/ui/DottedRule";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useMutation } from "convex/react";
import { Bot, Cake, ChevronLeft, ChevronRight, Flag } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import {
  addDays,
  formatClock,
  isCivilDate,
  parts,
  startOfWeek,
  weekday,
  type CivilDate,
} from "@kriyan/core/dates";
import { freeMinutes, layoutDay } from "@kriyan/core/layout";
import {
  formatDay,
  formatDuration,
  formatTimeRange,
  MONTH_SHORT,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
} from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useTodayView, useWeekView, type TaskView, type WeekView } from "@/data/views";
import { completeTask, errorText, moveTasks, ticking } from "@/features/tasks/actions";
import { openTask, TaskRow } from "@/features/tasks/TaskRow";
import { useIsPhone } from "@/theme/layout";
import { clampDay, externalDrag, registerDropZone, snap } from "@/features/today/drag";
import { DragGhost } from "@/features/today/DragGhost";
import { DragSource } from "@/features/today/DragSource";
import { Spine } from "@/features/today/Spine";
import { WeekStrip } from "@/features/today/WeekStrip";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { c, family, r, s, shadows, spaceTone, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Check, Dot, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { PageTitle, Screen, usePanelOpen } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";

/** "2 h planned", or "Nothing planned". */
function loadText(day: WeekView["days"][number]) {
  return day.plannedMinutes ? `${formatDuration(day.plannedMinutes)} planned` : "Nothing planned";
}

/** "15 min past your usual" when the day holds more than the daily capacity in Settings. */
function pastUsual(day: WeekView["days"][number]) {
  const past = day.plannedMinutes - day.capacity;
  return day.capacity > 0 && past > 0 ? `${formatDuration(past)} past your usual` : null;
}

/** "09:00 → 10:30", as Today's timeline writes a block's span. */
function span(time: number, length: number | null) {
  return length ? `${formatClock(time)} → ${formatClock(time + length)}` : formatClock(time);
}

/** "Mon 19 to Sun 25 Oct", the month once when the week stays in one. */
function weekRange(start: CivilDate) {
  const end = addDays(start, 6);
  const [, sm, sd] = parts(start);
  const [, em, ed] = parts(end);
  const first = `${WEEKDAY_SHORT[weekday(start)]} ${sd}${sm === em ? "" : ` ${MONTH_SHORT[sm - 1]}`}`;
  return `${first} to ${WEEKDAY_SHORT[weekday(end)]} ${ed} ${MONTH_SHORT[em - 1]}`;
}

/** Free time left this week, the way Today's header counts it: from now to each day's end. */
function weekFree(week: WeekView, today: CivilDate, now: number, dayStart: number, dayEnd: number) {
  return week.days
    .filter((d) => d.date >= today)
    .reduce((sum, d) => {
      const busy = d.scheduled
        .filter((t) => !t.done && t.length && !t.proposedBy)
        .map((t) => ({ id: t._id, start: t.time ?? 0, length: t.length ?? undefined }));
      const from = d.date === today ? Math.max(now, dayStart) : dayStart;
      return sum + freeMinutes(busy, from, dayEnd);
    }, 0);
}

export function UpcomingScreen() {
  const { today, now } = useClock();
  const phone = useIsPhone();
  // Today's week strip opens this screen on the day that was tapped.
  const { day: asked } = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState<CivilDate>(() => (asked && isCivilDate(asked) ? asked : today));
  const [start, setStart] = useState(() => startOfWeek(day));
  // A new day from Today's strip moves the week there (adjusting state while rendering, not in an effect).
  const [seen, setSeen] = useState(asked);
  if (asked !== seen) {
    setSeen(asked);
    if (asked && isCivilDate(asked)) {
      setDay(asked);
      setStart(startOfWeek(asked));
    }
  }
  const pickDay = (date: CivilDate) => {
    setDay(date);
    setStart(startOfWeek(date));
  };
  const week = useWeekView(start);
  const profile = useTodayView()?.profile;
  const thisWeek = start === startOfWeek(today);
  const free = week && profile ? weekFree(week, today, now, profile.dayStart, profile.dayEnd) : null;
  const proposals = week
    ? week.days.flatMap((d) => [...d.scheduled, ...d.anytime]).filter((t) => t.proposedBy)
    : [];
  const banner = proposals.length ? <ProposalBanner proposals={proposals} phone={phone} /> : null;
  const hours = {
    start: profile?.dayStart ?? DEFAULT_DAY_START,
    end: profile?.dayEnd ?? DEFAULT_DAY_END,
  };

  if (!phone) {
    return (
      <DesktopWeek
        week={week}
        start={start}
        today={today}
        thisWeek={thisWeek}
        free={free}
        hours={hours}
        banner={banner}
        onWeek={setStart}
      />
    );
  }

  return (
    <Screen title="Week">
      {/* B2's title row holds only "Week". The strip shows one week, so the way to another sits
          small at the end of the dates line under it. */}
      <View style={{ marginTop: -s.s8 + s.s1, flexDirection: "row", alignItems: "center", gap: s.s2 }}>
        <Txt variant="body" tone="ink3" tnum style={{ flex: 1 }}>
          {free !== null ? `${weekRange(start)} · ${hoursFree(free)} free` : weekRange(start)}
        </Txt>
        <WeekStep onStep={(n) => pickDay(addDays(day, 7 * n))} />
      </View>
      {/* b2.html `.pg-head` is 18 above the strip; the screen's gap between sections is 32. */}
      <View style={{ marginTop: -s.s4, gap: s.s8 }}>
        {/* In the list's flow, so it never covers a row (it floated over the spine). */}
        {banner}
        {week === undefined ? (
          <WeekSkeleton />
        ) : (
          <PhoneWeek week={week} day={day} today={today} now={now} onPick={pickDay} hours={hours} />
        )}
      </View>
    </Screen>
  );
}

/** b2.html's "14.5h free": whole and half hours, so the subtitle stays short. */
export function hoursFree(minutes: number): string {
  const half = Math.round(minutes / 30) / 2;
  return `${half}h`;
}

function WeekSkeleton() {
  return (
    <View testID="skeleton" style={{ gap: s.s6 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ gap: s.s2 }}>
          <Skeleton width={120} height={16} />
          <Skeleton width="100%" height={2} />
          <Skeleton width="60%" />
        </View>
      ))}
    </View>
  );
}

/**
 * Desktop (b2.html `weekDesk`): the tray of tasks to plan runs the window's height beside the
 * sidebar; the title, the day headers and the hour grid fill the rest, and only the grid scrolls,
 * under headers that stay put. An open task's panel takes the right of the window and the week
 * narrows beside it.
 */
function DesktopWeek({
  week,
  start,
  today,
  thisWeek,
  free,
  hours,
  banner,
  onWeek,
}: {
  week: WeekView | undefined;
  start: CivilDate;
  today: CivilDate;
  thisWeek: boolean;
  free: number | null;
  hours: { start: number; end: number };
  banner: ReactNode;
  onWeek: (start: CivilDate) => void;
}) {
  const panelOpen = usePanelOpen();
  const tasks = week ? [...week.inbox, ...week.unscheduled] : [];
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
      {Platform.OS === "web" ? (
        <Head>
          <title>Week | Kriyan</title>
        </Head>
      ) : null}
      <ScrollView
        style={{ width: sz.tray, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: c.line }}
        contentContainerStyle={{ paddingVertical: s.s6, paddingHorizontal: s.s4 }}
      >
        {week === undefined ? (
          <WeekSkeleton />
        ) : (
          <PlanTray
            tasks={tasks}
            today={today}
            free={free ? { minutes: free, from: thisWeek ? today : start } : null}
          />
        )}
      </ScrollView>
      <View style={{ flex: 1, minWidth: 0, paddingRight: panelOpen ? sz.panel : 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s.s2,
            paddingTop: s.s6,
            paddingHorizontal: s.s6,
            paddingBottom: s.s2,
          }}
        >
          <PageTitle title="Week" style={{ flex: 1 }} />
          <Txt variant="body" tone="ink3" tnum>
            {weekRange(start)}
          </Txt>
          {/* B2 shows only the dates here. Small and quiet after them, with the arrow keys as the
              quicker way; "This week" only once you've left it. */}
          {thisWeek ? null : (
            <Button variant="quiet" label="This week" onPress={() => onWeek(startOfWeek(today))} />
          )}
          <WeekStep onStep={(n) => onWeek(addDays(start, 7 * n))} keys />
        </View>
        {week === undefined ? (
          <View style={{ paddingHorizontal: s.s6 }}>
            <WeekSkeleton />
          </View>
        ) : (
          <>
            {weekIsEmpty(week) ? (
              <Txt variant="meta" tone="ink3" style={{ paddingHorizontal: s.s6, paddingBottom: s.s2 }}>
                {tasks.length
                  ? "Nothing planned this week yet. Drag a task onto a day, or press N to add one."
                  : "Nothing planned this week yet. Press N to add a task."}
              </Txt>
            ) : null}
            <WeekGrid week={week} today={today} dayStart={hours.start} dayEnd={hours.end} />
          </>
        )}
        {banner}
      </View>
      {/* Outside the scroll views: inside, their offset would move the "fixed" ghost away from the pointer. */}
      <DragGhost />
    </View>
  );
}

/**
 * Back and forward a week: two small chevrons that don't add to the line they sit on. On
 * desktop the left and right arrow keys do the same while the Week is on screen.
 */
function WeekStep({ onStep, keys }: { onStep: (weeks: -1 | 1) => void; keys?: boolean }) {
  const step = useRef(onStep);
  useEffect(() => {
    step.current = onStep;
  });
  useFocusEffect(
    useCallback(() => {
      if (!keys || Platform.OS !== "web") return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || typingIn(e.target)) return;
        if (document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        step.current(e.key === "ArrowLeft" ? -1 : 1);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [keys]),
  );
  const phone = useIsPhone();
  // 44 to a finger and 32 to a pointer, pulled into the line so it grows no taller.
  const size = phone ? sz.touch : sz.ctl;
  return (
    <View
      style={{
        flexDirection: "row",
        marginVertical: phone ? -s.s3 : -s.s1,
        marginRight: phone ? -s.s3 : -s.s2,
      }}
    >
      {(
        [
          [-1, ChevronLeft, "Previous week"],
          [1, ChevronRight, "Next week"],
        ] as const
      ).map(([n, glyph, label]) => (
        <Press
          key={n}
          role="button"
          accessibilityLabel={label}
          onPress={() => onStep(n)}
          scale={false}
          style={{
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: r.ctl,
          }}
        >
          {({ hovered }) => <Icon icon={glyph} size={16} tone={hovered ? "ink" : "ink3"} />}
        </Press>
      ))}
    </View>
  );
}

function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/** Nothing on any day: no blocks, no anytime tasks, no deadlines. */
function weekIsEmpty(week: WeekView) {
  return week.days.every((d) => !d.scheduled.length && !d.anytime.length && !d.deadlines.length);
}

/** The profile's defaults (convex/model/owner.ts), for the moment before Today's view loads. */
const DEFAULT_DAY_START = 8 * 60;
const DEFAULT_DAY_END = 22 * 60;

/**
 * Tasks not scheduled yet (b2.html `.wk-inbox`): drag one onto a day (no time) or into the
 * grid (at a time). Then how much free time the rest of the week holds.
 */
function PlanTray({
  tasks,
  today,
  free,
}: {
  tasks: TaskView[];
  today: CivilDate;
  free: { minutes: number; from: CivilDate } | null;
}) {
  return (
    <View aria-label="Not scheduled yet" style={{ gap: s.s2 }}>
      <View style={{ gap: s.s1, paddingBottom: s.s1 }}>
        <SectionLabel title="Not scheduled yet" count={String(tasks.length)} />
        <Txt variant="meta" tone="ink3">
          {tasks.length
            ? "Drag a task onto the week to timebox it."
            : "Nothing waiting. Every task has a day."}
        </Txt>
      </View>
      {tasks.map((t) => (
        <TrayCard key={t._id} task={t} today={today} />
      ))}
      {free && free.minutes > 0 ? (
        <Txt variant="meta" tone="ink3" style={{ paddingTop: s.s2 }}>
          Free this week: {hoursFree(free.minutes)} between {WEEKDAY_SHORT[weekday(free.from)]} and Sun.
        </Txt>
      ) : null}
    </View>
  );
}

/** One task to plan (b2.html `.ib`): its title, then its length (or "No length") and its due date. */
function TrayCard({ task, today }: { task: TaskView; today: CivilDate }) {
  const tone = spaceTone(task.color);
  const meta = [
    task.length ? formatDuration(task.length) : "No length",
    ...(task.deadline ? [`due ${formatDay(task.deadline, today)}`] : []),
  ].join(" · ");
  return (
    <DragSource taskId={task._id} title={task.title} color={tone.dot} length={task.length}>
      <Press
        role="button"
        accessibilityLabel={`Open ${task.title}`}
        onPress={() => openTask(task._id)}
        scale={false}
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: s.s2,
          paddingVertical: s.s2,
          paddingHorizontal: s.s3,
          borderRadius: r.card,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.raised,
        }}
      >
        {/* Level with the title's first line. */}
        <View style={{ marginTop: s.s2 }}>
          <Dot color={task.color ? tone.dot : c.ink3} size={7} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="label" numberOfLines={2} style={family("600")}>
            {task.title}
          </Txt>
          <Txt variant="meta" tone="ink3" numberOfLines={2}>
            {meta}
          </Txt>
        </View>
      </Press>
    </DragSource>
  );
}

function ProposalBanner({ proposals, phone }: { proposals: TaskView[]; phone: boolean }) {
  const settle = useMutation(api.tasks.settleProposals);
  const who = proposals[0]?.proposedBy ?? "An agent";
  const days = [...new Set(proposals.map((t) => t.date).filter((d): d is string => Boolean(d)))]
    .sort()
    .map((d) => WEEKDAY_SHORT[weekday(d)]);
  const run = (accept: boolean) =>
    void settle({ accept, ids: proposals.map((t) => t._id) })
      .then((n) => showToast(accept ? `Added ${n} to your plan` : `Discarded ${n} proposed`))
      .catch((e: unknown) => showToast(errorText(e)));
  return (
    <View
      role="status"
      style={
        phone
          ? undefined
          : { position: "absolute", bottom: s.s6, left: 0, right: 0, alignItems: "center", zIndex: 6 }
      }
      pointerEvents="box-none"
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: phone ? "wrap" : "nowrap",
          alignItems: "center",
          gap: s.s3,
          paddingVertical: s.s2,
          paddingLeft: s.s4,
          paddingRight: s.s2,
          borderRadius: r.card,
          backgroundColor: phone ? c.raised : c.overlay,
          boxShadow: phone ? shadows.raised : shadows.overlay,
        }}
      >
        <Icon icon={Bot} />
        <Txt variant="body" style={phone ? { flexBasis: "80%" } : undefined}>
          {who} proposed {proposals.length} {proposals.length === 1 ? "block" : "blocks"} for{" "}
          {[...new Set(days)].join(" and ")}
        </Txt>
        <Button label="Review" onPress={() => proposals[0] && openTask(proposals[0]._id)} />
        <Button label="Discard" onPress={() => run(false)} />
        <Button variant="primary" label="Accept all" onPress={() => run(true)} />
      </View>
    </View>
  );
}

/**
 * Planned against the day's capacity, drawn as the day header's bottom edge so it costs no
 * height. A day past it fills to the end, in ink like any other.
 */
function LoadLine({ day }: { day: WeekView["days"][number] }) {
  const p = day.capacity > 0 ? Math.min(1, day.plannedMinutes / day.capacity) : 0;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2 }}>
      <View style={{ width: `${Math.round(p * 100)}%`, height: "100%", backgroundColor: c.ink3 }} />
    </View>
  );
}

/** A task for the day with no time: tick it off here, or open it. */
function Anytime({ task }: { task: TaskView }) {
  const ticked = ticking.useValue((t) => Boolean(t[task._id]));
  const tone = spaceTone(task.color);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: 24 }}>
      <Check
        size={14}
        color={tone.dot}
        done={task.done || ticked}
        disabled={task.projected}
        label={`Complete: ${task.title}`}
        onPress={() => !task.done && !ticked && completeTask(task)}
      />
      <Press
        role="button"
        accessibilityLabel={`Open ${task.title}`}
        onPress={() => openTask(task._id)}
        hoverBg={null}
        scale={false}
        // The row's full 24px height, not just the line of text, is the target.
        style={{ flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center" }}
      >
        <Txt
          variant="meta"
          tone={task.done || ticked ? "ink3" : "ink2"}
          strike={task.done || ticked}
          numberOfLines={2}
        >
          {task.title}
        </Txt>
      </Press>
    </View>
  );
}

function Due({ task }: { task: TaskView }) {
  const birthday = task.repeat?.freq === "year";
  return (
    <Press
      role="button"
      accessibilityLabel={`Open ${task.title}`}
      onPress={() => openTask(task._id)}
      hoverBg={null}
      scale={false}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s1, minHeight: 24, paddingTop: s.s1 }}
    >
      <Icon icon={birthday ? Cake : Flag} size={14} />
      <Txt variant="meta" tone="ink2" numberOfLines={2} style={{ flexShrink: 1 }}>
        {birthday ? task.title : `${task.title} due`}
      </Txt>
    </Press>
  );
}

/** A day header marks at most this many things with no time, one dot each. */
const MARKS = 3;

/**
 * A dot per deadline, birthday or task with no time, in its space's colour, in the room under
 * the date, so the header keeps B2's height.
 */
function UntimedMarks({ items }: { items: { t: TaskView }[] }) {
  if (!items.length) return null;
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={{ position: "absolute", bottom: 2, flexDirection: "row", gap: s.s1 }}
    >
      {items.slice(0, MARKS).map(({ t }) => (
        <Dot key={`${t._id}:${t.date}`} color={t.color ? spaceTone(t.color).dot : c.ink3} size={5} />
      ))}
    </View>
  );
}

/** The hour labels' column, left of the day columns (b2.html `.wk-grid`). */
const GUTTER = 52;
/** An hour's height. b2.html's is 50; 48 keeps the grid on the 4px rhythm. */
const H = 48;
/** Room above the first hour line for its label. */
const GRID_TOP = s.s3;

function WeekGrid({
  week,
  today,
  dayStart,
  dayEnd,
}: {
  week: WeekView;
  today: string;
  dayStart: number;
  dayEnd: number;
}) {
  // B2 keeps the dates right on the timed grid. Deadlines, birthdays and tasks with no time are a
  // few dots under a day's date; pressing a day lays them out under the dates for the whole week.
  const [untimedOpen, setUntimedOpen] = useState(false);
  const allTimed = week.days.flatMap((d) => d.scheduled);
  // The person's day from Settings, stretched to fit anything planned outside it.
  const from = Math.min(
    Math.floor(dayStart / 60),
    ...allTimed.map((t) => Math.floor((t.time ?? dayStart) / 60)),
  );
  const to = Math.max(
    Math.ceil(dayEnd / 60),
    ...allTimed.map((t) => Math.ceil(((t.time ?? 0) + Math.max(t.length ?? 0, 30)) / 60)),
  );
  const y = (m: number) => ((m - from * 60) / 60) * H;
  const dayItems = week.days.map((d) => [
    ...[...d.deadlines, ...d.anytime.filter((t) => t.repeat?.freq === "year")].map((t) => ({
      t,
      anytime: false,
    })),
    ...d.anytime.filter((t) => t.repeat?.freq !== "year").map((t) => ({ t, anytime: true })),
  ]);
  const anyAllDay = dayItems.some((items) => items.length > 0);
  const bandOpen = untimedOpen && anyAllDay;

  // The week is a drop zone: over a day's header a task lands on that day, over the grid at a
  // time. The headers stick to the top of the scroll view, so the grid's offset is the scroll.
  const view = useRef<View>(null);
  const scrollY = useRef(0);
  const [headH, setHeadH] = useState(0);
  const drag = externalDrag.useValue((d) => d);
  const tasks = useMemo(
    () =>
      new Map(
        [...week.inbox, ...week.unscheduled, ...week.days.flatMap((d) => [...d.scheduled, ...d.anytime])].map(
          (t) => [t._id as string, t],
        ),
      ),
    [week],
  );
  useFocusEffect(
    useCallback(
      () =>
        registerDropZone({
          measure: () =>
            new Promise((resolve) => {
              if (!view.current) return resolve(null);
              view.current.measureInWindow((x, top, width, height) => resolve({ x, y: top, width, height }));
            }),
          startMinutes: from * 60,
          hourPx: H,
          topPad: headH + GRID_TOP,
          hit: (rect, x, py) => {
            const colW = (rect.width - GUTTER) / 7;
            const day = week.days[Math.floor((x - rect.x - GUTTER) / colW)];
            if (!day || py < rect.y || py > rect.y + rect.height + 24) return null;
            if (py < rect.y + headH) return { date: day.date, minutes: null };
            const inGrid = py - rect.y - headH - GRID_TOP + scrollY.current;
            return { date: day.date, minutes: clampDay(snap(from * 60 + (inGrid / H) * 60)) };
          },
          onDrop: (taskId, drop) => {
            const task = tasks.get(taskId);
            if (task && drop.date) void moveTasks([task], drop.date, drop.minutes ?? undefined);
          },
        }),
      [from, headH, week.days, tasks],
    ),
  );

  return (
    <View ref={view} style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        style={{ flex: 1 }}
        stickyHeaderIndices={[0]}
        scrollEventThrottle={32}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={{ paddingBottom: s.s6 }}
      >
        {/* b2.html `.wk-head`: the weekday in small capitals over the date, centred; today's in red. */}
        <View
          onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}
          style={{ backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.line, zIndex: 2 }}
        >
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: GUTTER }} />
            {week.days.map((d, i) => {
              const past = pastUsual(d);
              const target = drag?.over?.date === d.date && drag.over.minutes === null;
              const items = dayItems[i] ?? [];
              const name = `${WEEKDAY_LONG[i]} ${parts(d.date)[2]}, ${loadText(d)}${past ? `, ${past}` : ""}`;
              const body = (
                <>
                  <Txt
                    variant="caption"
                    tone={d.isToday ? "now" : "ink3"}
                    accessibilityLabel={WEEKDAY_LONG[i]}
                    style={{ ...family("600"), textTransform: "uppercase", letterSpacing: 0.6 }}
                  >
                    {WEEKDAY_SHORT[i]}
                  </Txt>
                  <Txt variant="title" tone={d.isToday ? "now" : "ink"} tnum>
                    {parts(d.date)[2]}
                  </Txt>
                  <UntimedMarks items={items} />
                  <LoadLine day={d} />
                </>
              );
              const cell = {
                flex: 1,
                alignItems: "center",
                paddingBottom: s.s2,
                borderRadius: r.ctl,
                backgroundColor: target ? c.hover : "transparent",
              } as const;
              return items.length ? (
                <Press
                  key={d.date}
                  role="button"
                  aria-expanded={bandOpen}
                  accessibilityLabel={`${name}, ${items.length} with no time. ${bandOpen ? "Hide" : "Show"} them`}
                  onPress={() => setUntimedOpen(!untimedOpen)}
                  scale={false}
                  style={cell}
                >
                  {body}
                </Press>
              ) : (
                <View key={d.date} accessibilityLabel={name} style={cell}>
                  {body}
                </View>
              );
            })}
          </View>
          {/* Deadlines, birthdays and tasks for the day with no time, once a day is pressed. */}
          {bandOpen ? (
            <View style={{ flexDirection: "row", paddingBottom: s.s2 }}>
              <View style={{ width: GUTTER }} />
              {week.days.map((d, i) => {
                const items = dayItems[i] ?? [];
                const target = drag?.over?.date === d.date && drag.over.minutes === null;
                return (
                  <View
                    key={d.date}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      paddingHorizontal: s.s1,
                      gap: 2,
                      borderRadius: r.ctl,
                      backgroundColor: target ? c.hover : "transparent",
                    }}
                  >
                    {items.map(({ t, anytime }) =>
                      anytime ? <Anytime key={t._id} task={t} /> : <Due key={t._id} task={t} />,
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", height: y(to * 60) + GRID_TOP, paddingTop: GRID_TOP }}>
          {/* Hairlines at each hour, behind the blocks, so a time reads across the week. */}
          {Array.from({ length: to - from + 1 }, (_, k) => (
            <View
              key={`line-${k}`}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: GUTTER,
                right: 0,
                top: GRID_TOP + k * H,
                height: 1,
                backgroundColor: c.line,
              }}
            />
          ))}
          <View style={{ width: GUTTER }}>
            {Array.from({ length: to - from }, (_, k) => (
              <Txt
                key={k}
                variant="meta"
                tone="ink3"
                tnum
                style={{ position: "absolute", top: k * H, right: s.s2, transform: [{ translateY: -8 }] }}
              >
                {String(from + k).padStart(2, "0")}:00
              </Txt>
            ))}
          </View>
          {week.days.map((d) => (
            <View
              key={d.date}
              style={{
                flex: 1,
                position: "relative",
                borderLeftWidth: 1,
                borderLeftColor: c.line,
                // b2.html `.wcol.today`: a faint tint down today's whole column.
                backgroundColor: d.isToday ? c.hover : "transparent",
              }}
            >
              {(() => {
                // Blocks that start together sit side by side; a later one sits on top, indented.
                const placed = new Map(
                  layoutDay(
                    d.scheduled.map((t) => ({
                      id: `${t._id}:${t.date}`,
                      start: t.time ?? 0,
                      length: t.length ?? undefined,
                    })),
                  ).map((p) => [p.id, p]),
                );
                return d.scheduled.map((t) => {
                  const p = placed.get(`${t._id}:${t.date}`);
                  const cols = p?.columns ?? 1;
                  const col = p?.column ?? 0;
                  const depth = Math.min(p?.depth ?? 0, 3);
                  const tone = spaceTone(t.color);
                  const top = y(t.time ?? 0) + 1;
                  const h = Math.max(24, (Math.max(t.length ?? 0, 30) / 60) * H - 2);
                  const proposed = Boolean(t.proposedBy);
                  return (
                    <View
                      key={`${t._id}:${t.date}`}
                      style={{
                        position: "absolute",
                        top,
                        height: h,
                        left: `${(col / cols) * 100}%`,
                        width: `${100 / cols}%`,
                        // The first block's edge lines up with the day's name above it; a block on
                        // top of another starts further in, so the one below keeps its title.
                        paddingLeft: (col ? 0 : s.s2) + depth * s.s2,
                        paddingRight: s.s1,
                      }}
                    >
                      <Press
                        role="button"
                        accessibilityLabel={`Open ${t.title}, ${formatDay(d.date, today)} ${formatClock(t.time ?? 0)}${proposed ? `, proposed by ${t.proposedBy}` : ""}`}
                        onPress={() => openTask(t._id)}
                        hoverBg={null}
                        scale={false}
                        // b2.html `.ev`: the space's colour as a bar down the left edge over its
                        // surface; done blocks go grey, proposed ones are dashed until accepted.
                        style={({ hovered }) => ({
                          flex: 1,
                          paddingVertical: s.s1,
                          // Narrow columns: room for "09:00 → 10:30" beside the colour bar.
                          paddingLeft: s.s2,
                          paddingRight: s.s1,
                          borderRadius: r.ctl,
                          overflow: "hidden",
                          backgroundColor: proposed ? c.bg : t.done ? c.sunken : tone.surface,
                          borderLeftWidth: 3,
                          borderLeftColor: t.done ? c.lineStrong : tone.dot,
                          ...(proposed
                            ? { borderWidth: 1, borderStyle: "dashed" as const, borderColor: tone.dot }
                            : {}),
                          // A block on top of another keeps an edge, so the one below stays readable.
                          ...(depth && !proposed ? { borderWidth: 1, borderColor: c.bg } : {}),
                          boxShadow: hovered ? `inset 0 0 0 999px ${c.hover}` : undefined,
                        })}
                      >
                        <Txt
                          variant="caption"
                          tone={t.done ? "ink3" : "ink"}
                          strike={t.done}
                          numberOfLines={1}
                          style={family("600")}
                        >
                          {t.title}
                        </Txt>
                        {h >= 40 ? (
                          <Txt variant="meta" tone={t.done ? "ink3" : "ink2"} tnum numberOfLines={1}>
                            {span(t.time ?? 0, t.length)}
                          </Txt>
                        ) : null}
                      </Press>
                    </View>
                  );
                });
              })()}
              {drag?.over?.date === d.date && drag.over.minutes !== null ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: s.s2,
                    right: s.s1,
                    top: y(drag.over.minutes) + 1,
                    height: Math.max(24, (Math.max(drag.length ?? 0, 30) / 60) * H - 2),
                    borderRadius: r.ctl,
                    borderWidth: 1,
                    borderColor: c.lineStrong,
                    backgroundColor: c.hover,
                    paddingHorizontal: s.s2,
                    paddingVertical: s.s1,
                  }}
                >
                  <Txt variant="meta" tone="ink2" tnum numberOfLines={1}>
                    {formatTimeRange(drag.over.minutes, drag.length ?? undefined)}
                  </Txt>
                </View>
              ) : null}
              {d.isToday ? <NowLine y={y} from={from} to={to} /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function NowLine({ y, from, to }: { y: (m: number) => number; from: number; to: number }) {
  const { now } = useClock();
  // Outside the grid's hours there is no place for it; drawn anyway it floats over the header.
  if (now < from * 60 || now > to * 60) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: y(now), height: 1, backgroundColor: c.now }}
    >
      {/* The same mark as Today's timeline, so a 1px line in a narrow column still reads as now. */}
      <View
        style={{
          position: "absolute",
          left: -3,
          top: -3,
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: c.now,
        }}
      />
    </View>
  );
}

/** The phone's Week: the strip, the picked day's spine, its anytime tasks, then what has no day. */
function PhoneWeek({
  week,
  day,
  today,
  now,
  onPick,
  hours,
}: {
  week: WeekView;
  day: CivilDate;
  today: CivilDate;
  now: number;
  onPick: (date: CivilDate) => void;
  hours: { start: number; end: number };
}) {
  const sel = week.days.find((d) => d.date === day);
  const anytime = sel ? [...sel.deadlines, ...sel.anytime] : [];
  const toPlan = [...week.inbox, ...week.unscheduled];
  return (
    <>
      <View style={{ gap: s.s3 }}>
        <WeekStrip today={today} selected={day} onSelect={onPick} />
        <Spine date={day} items={sel?.scheduled ?? []} now={day === today ? now : null} day={hours} />
      </View>
      {anytime.length ? (
        <View style={{ gap: s.s1 }}>
          <SectionLabel title="Anytime" count={String(anytime.length)} />
          {anytime.map((t) => (
            <DottedRow key={`${t._id}:${t.date}`}>
              <TaskRow task={t} today={today} />
            </DottedRow>
          ))}
        </View>
      ) : null}
      {toPlan.length ? (
        <View style={{ gap: s.s1 }}>
          <SectionLabel title="Not scheduled yet" count={String(toPlan.length)} />
          {toPlan.map((t) => (
            <DottedRow key={t._id}>
              <PlaceRow task={t} day={day} today={today} />
            </DottedRow>
          ))}
        </View>
      ) : null}
    </>
  );
}

/**
 * A task with no day yet (b2.html `.tray-r`): its space's dot, its length and due date, and
 * Place, which puts it on the day picked in the strip above. Its time is then a tap away in
 * the task, or a drag on desktop.
 */
function PlaceRow({ task, day, today }: { task: TaskView; day: CivilDate; today: CivilDate }) {
  const tone = spaceTone(task.color);
  const meta = [
    task.length ? formatDuration(task.length) : "No length",
    ...(task.deadline ? [`due ${formatDay(task.deadline, today)}`] : []),
  ].join(" · ");
  const where = formatDay(day, today);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        minHeight: sz.touch,
        paddingVertical: s.s2,
      }}
    >
      <Dot color={task.color ? tone.dot : c.ink3} />
      <Press
        role="button"
        accessibilityLabel={`Open ${task.title}`}
        onPress={() => openTask(task._id)}
        hoverBg={null}
        scale={false}
        style={{ flex: 1, minWidth: 0 }}
      >
        <Txt variant="label" numberOfLines={2}>
          {task.title}
        </Txt>
        <Txt variant="meta" tone="ink3" numberOfLines={1}>
          {meta}
        </Txt>
      </Press>
      <Button
        label="Place"
        accessibilityLabel={`Place ${task.title} on ${where}`}
        onPress={() => void moveTasks([task], day)}
        style={{ borderRadius: r.pill, backgroundColor: c.hover }}
      />
    </View>
  );
}

/** The prototype's dotted rule under each row (b2.html `.row`, `.tray-r`). */
function DottedRow({ children }: { children: ReactNode }) {
  return (
    <View>
      {children}
      <DottedRule />
    </View>
  );
}

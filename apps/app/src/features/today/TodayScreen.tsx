// Today (docs/design/v4, b2.html?screen=today): the black header with the day in one sentence,
// the week, what agents did, what's next with Start focus, habits, then the day as a list
// grouped by part of the day or as the spine timeline. On a desktop wide enough, the day's hour
// grid sits beside the list with what's next pinned at its foot.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, RefreshControl, useWindowDimensions, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useMutation } from "convex/react";
import {
  Cake,
  Check as CheckIcon,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Play,
  Plus,
} from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { formatClock } from "@kriyan/core/dates";
import { formatDate, formatDuration } from "@kriyan/core/format";
import { freeMinutes } from "@kriyan/core/layout";
import { SPLIT_MIN_WIDTH } from "@kriyan/core/tokens";
import { useClock } from "@/data/time";
import { useInboxView, useProfile, useTodayView, type TaskView, type TodayView } from "@/data/views";
import { closedDay } from "@/features/review/closedDay";
import { moveTasks, placeTasks } from "@/features/tasks/actions";
import { toggleHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { QuickAdd, type QuickAddHandle } from "@/features/tasks/QuickAdd";
import { Segmented } from "@/features/tasks/Segmented";
import { openTask, TaskRow } from "@/features/tasks/TaskRow";
import { quickAddTarget } from "@/features/shell/context";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, spaceTone, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Ring, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { Notice, Screen, SectionHead, usePanelOpen } from "@/ui/Screen";
import { LightStatusBar } from "@/ui/statusBar";
import { Txt } from "@/ui/Txt";
import { AgentNote } from "./AgentNote";
import { dayRows, type DayRow } from "./dayRows";
import { measureSlots, registerDropZone } from "./drag";
import { DragGhost } from "./DragGhost";
import { DragSource } from "./DragSource";
import { PlanToday } from "./PlanToday";
import { ReviewCard } from "./ReviewCard";
import { FreeGap, Spine } from "./Spine";
import { Timeline } from "./Timeline";
import { TodayHeader } from "./TodayHeader";
import { WeekStrip } from "./WeekStrip";

export function TodayScreen() {
  const view = useTodayView();
  const { today, now } = useClock();
  const phone = useIsPhone();
  const { width } = useWindowDimensions();
  const panelOpen = usePanelOpen();
  const quickAdd = useRef<QuickAddHandle>(null);
  const inbox = useInboxView();
  const [planning, setPlanning] = useState(false);
  const planRef = useRef<View>(null);
  // The schedule moves beside the list when both fit. An open task's panel replaces the
  // schedule column, so the list stays exactly where it was.
  const split = !phone && width >= SPLIT_MIN_WIDTH;

  useEffect(() => {
    if (phone) return;
    quickAddTarget.set({ focus: () => quickAdd.current?.focus() });
    return () => quickAddTarget.set(null);
  }, [phone]);

  const free = view ? freeTime(view, now) : null;
  // Planning is offered when there's something to bring in, and never required.
  const toPlan = view ? view.earlier.length + (inbox?.length ?? 0) : 0;
  // On phones the icon alone, so List / Timeline and Close the day keep one line.
  const planButton = toPlan ? (
    <Button
      ref={planRef}
      icon={ListChecks}
      label={phone ? undefined : "Plan today"}
      accessibilityLabel="Plan today"
      onPress={() => setPlanning(true)}
    />
  ) : null;
  const add = phone ? null : <QuickAdd ref={quickAdd} variant="inline" defaultDate={today} />;
  const header = view ? <TodayHeader view={view} today={today} now={now} free={free} /> : null;
  // The status bar's icons are light over the black header and follow the scheme once it has
  // scrolled away; otherwise they'd be white on the white page.
  const [headHeight, setHeadHeight] = useState(0);
  const [pastHead, setPastHead] = useState(false);
  // Pull down at the top to add (B2's gestures); the + button does the same.
  const [pulling, setPulling] = useState(false);
  const scrollProps = phone
    ? {
        scrollEventThrottle: 32,
        onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
          const past = headHeight > 0 && e.nativeEvent.contentOffset.y > headHeight;
          if (past !== pastHead) setPastHead(past);
        },
        ...(Platform.OS === "web"
          ? {}
          : {
              refreshControl: (
                <RefreshControl
                  refreshing={pulling}
                  onRefresh={() => {
                    setPulling(true);
                    router.push("/add");
                    setTimeout(() => setPulling(false), 300);
                  }}
                />
              ),
            }),
      }
    : undefined;
  // Desktop: the header card heads the column (or the list, when the timeline sits beside it).
  const head = phone ? null : header;

  return (
    <View style={{ flex: 1 }}>
      <LightStatusBar enabled={phone && !pastHead} />
      <Screen
        title="Today"
        hero={
          header ? <View onLayout={(e) => setHeadHeight(e.nativeEvent.layout.height)}>{header}</View> : null
        }
        scrollProps={scrollProps}
        width={split ? sz.column + s.s12 + sz.schedule : "column"}
        panelCovers={split}
      >
        {split ? null : head}
        {view === undefined ? (
          <>
            {split ? head : null}
            {add}
            <TodaySkeleton />
          </>
        ) : (
          <TodayBody
            view={view}
            today={today}
            now={now}
            split={split}
            panelOpen={panelOpen}
            head={split ? head : null}
            add={add}
            planButton={planButton}
            onAdd={() => (phone ? router.push("/add") : quickAdd.current?.focus())}
          />
        )}
      </Screen>
      <DragGhost />
      {view ? (
        <PlanToday
          open={planning}
          onClose={() => setPlanning(false)}
          anchor={planRef}
          today={today}
          earlier={view.earlier}
          inbox={inbox ?? []}
          free={free ?? 0}
        />
      ) : null}
    </View>
  );
}

function freeTime(view: TodayView, now: number): number {
  const busy = view.scheduled
    .filter((t) => !t.done && t.length && !t.proposedBy)
    .map((t) => ({ id: t._id, start: t.time ?? 0, length: t.length ?? undefined }));
  return freeMinutes(busy, Math.max(now, view.profile.dayStart), view.profile.dayEnd);
}

/** The parts of the day the list is grouped by, as Tiimo does: by when, not by type. */
const PARTS = [
  { title: "Morning", to: 12 * 60 },
  { title: "Afternoon", to: 17 * 60 },
  { title: "Evening", to: 24 * 60 },
] as const;

const partOf = (minutes: number) => (PARTS.find((p) => minutes < p.to) ?? PARTS[2]).title;

/** "Review today" shows at this time when the person hasn't picked one (Settings). */
const DEFAULT_REVIEW = 20 * 60;

function TodayBody({
  view,
  today,
  now,
  split,
  panelOpen,
  head,
  add,
  planButton,
  onAdd,
}: {
  view: TodayView;
  today: string;
  now: number;
  split: boolean;
  panelOpen: boolean;
  /** The header, when it heads the list column rather than the page (split). */
  head: ReactNode;
  /** The inline quick add (desktop), at the top of the list. */
  add: ReactNode;
  planButton: ReactNode;
  onAdd: () => void;
}) {
  const phone = useIsPhone();
  const profile = useProfile();
  const closed = closedDay.useValue((d) => d) === today;
  const [showEarlierHours, setShowEarlierHours] = useState(false);
  // Phones have no hour grid on Today: a task held in the list drops on a free stretch.
  useFocusEffect(
    useCallback(() => {
      if (!phone) return;
      return registerDropZone({
        // No grid to measure; the free stretches say where they are.
        measure: () => Promise.resolve(null),
        startMinutes: 0,
        hourPx: 60,
        topPad: 0,
        slots: measureSlots,
        onDrop: (taskId, drop) => {
          if (drop.minutes !== null) void placeTasks([taskId as TaskView["_id"]], today, drop.minutes);
        },
      });
    }, [phone, today]),
  );
  const [mode, setMode] = useState<"list" | "timeline">("list");
  const nothing =
    view.scheduled.length === 0 &&
    view.anytime.length === 0 &&
    view.due.length === 0 &&
    view.done.length === 0 &&
    view.earlier.length === 0 &&
    view.habits.length === 0;
  if (nothing) {
    return (
      <>
        {head}
        <WeekStrip today={today} />
        {add}
        <AgentNote />
        <Notice
          title="Nothing planned for today"
          body="Add what's on your mind, like “call the bank tomorrow 10am”. Anything without a date waits in your Inbox."
          action={<Button icon={Plus} label="Add your first task" onPress={onAdd} />}
        />
      </>
    );
  }

  const live = view.scheduled.filter((t) => !t.done && !t.proposedBy);
  const current = live.find((t) => t.time !== null && t.length && t.time <= now && now < t.time + t.length);
  // Next is the first other block that isn't over: one still running beside the current one
  // comes before one that starts later.
  const next = live.find(
    (t) =>
      t.time !== null &&
      t._id !== current?._id &&
      (t.time > now || (t.length !== null && now < t.time + t.length)),
  );
  const left = view.due.length + view.anytime.length;
  const cleared =
    left === 0 &&
    live.every((t) => (t.time ?? 0) + (t.length ?? 0) <= now) &&
    (view.done.length > 0 || view.scheduled.some((t) => t.done));
  // The card waits at the review time until the day is closed (b2.html `rvcardtoday`).
  const reviewAt = closed ? null : (profile?.reviewTime ?? DEFAULT_REVIEW);
  // Hours before an hour ago fold away, but never over a block that slipped: it stays in
  // sight until it's ticked off or moved.
  const slipped = view.scheduled.filter(
    (t) => !t.done && !t.event && !t.proposedBy && !t.projected && t.time !== null && t.time < now - 60,
  );
  const foldAt = Math.min(now - 60, ...slipped.map((t) => t.time ?? now));
  const fold = !showEarlierHours && foldAt > view.profile.dayStart ? foldAt : null;
  const doneEarlier = view.scheduled.filter((t) => t.done && (t.time ?? 0) < (fold ?? 0)).length;
  const upNext = current || next ? <UpNext current={current} next={next} now={now} /> : null;

  const anytimeRows = (
    <View>
      {[...view.due, ...view.anytime].map((t) => (
        <Dotted key={`${t._id}:${t.date}`}>
          <TaskRow
            task={t}
            today={today}
            movable
            wrap={(row) => (
              <DragSource taskId={t._id} title={t.title} color={spaceTone(t.color).dot} length={t.length}>
                {row}
              </DragSource>
            )}
          />
        </Dotted>
      ))}
      {view.done.map((t) => (
        <Dotted key={`${t._id}:${t.date}:done`}>
          <TaskRow task={t} today={today} />
        </Dotted>
      ))}
    </View>
  );

  // The timed rows, grouped into parts of the day, with free stretches, the now line and the
  // review card between them.
  const groups: { part: string; rows: DayRow[] }[] = [];
  for (const row of dayRows(view.scheduled, { now, dayStart: view.profile.dayStart, reviewAt })) {
    const part = partOf(row.kind === "now" ? (row.next?.time ?? row.at) : row.at);
    const last = groups.at(-1);
    if (last?.part === part) last.rows.push(row);
    else groups.push({ part, rows: [row] });
  }

  const grouped = (
    <View style={{ gap: s.s6 }}>
      {view.earlier.length ? <Earlier tasks={view.earlier} today={today} /> : null}
      <View style={{ gap: s.s1 }}>
        <SectionHead title="Anytime" meta={left ? `${left} left` : undefined} />
        {cleared && view.earlier.length === 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, paddingVertical: s.s2 }}>
            <Icon icon={CheckIcon} tone="ink2" />
            <Txt variant="body" tone="ink2">
              Nothing left today.
            </Txt>
          </View>
        ) : null}
        {anytimeRows}
        {!cleared && left === 0 && view.done.length === 0 ? (
          <Txt variant="body" tone="ink3">
            Everything today has a time.
          </Txt>
        ) : null}
      </View>
      {groups.map((g) => (
        <View key={g.part} style={{ gap: s.s1 }}>
          <SectionHead title={g.part} meta={`${g.rows.filter((row) => row.kind === "task").length}`} />
          <View>
            {g.rows.map((row) =>
              row.kind === "task" ? (
                <Dotted key={row.key}>
                  <TaskRow task={row.task} today={today} movable clock />
                </Dotted>
              ) : row.kind === "gap" ? (
                <View key={row.key} style={{ paddingVertical: s.s1 }}>
                  <FreeGap start={row.at} minutes={row.minutes} date={today} droppable={phone} />
                </View>
              ) : row.kind === "now" ? (
                <ListNow key={row.key} now={row.at} next={row.next} />
              ) : (
                <ReviewCard key={row.key} at={row.at} />
              ),
            )}
          </View>
        </View>
      ))}
    </View>
  );

  const spine = (
    <Spine
      droppable={phone}
      date={today}
      items={view.scheduled}
      now={now}
      dayStart={view.profile.dayStart}
      reviewAt={reviewAt}
    />
  );

  const tools = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, flexWrap: "wrap" }}>
      <Segmented
        label="View"
        value={mode}
        options={[
          { value: "list", label: "List" },
          { value: "timeline", label: "Timeline" },
        ]}
        onChange={setMode}
      />
      <View style={{ flex: 1 }} />
      {planButton}
      {closed ? null : (
        <Button variant="quiet" label="Close the day" onPress={() => router.push("/review")} />
      )}
    </View>
  );

  const list = (
    <>
      {head}
      <WeekStrip today={today} />
      {add}
      <AgentNote />
      {/* Desktop pins what's next at the foot of the day column instead. */}
      {split ? null : upNext}
      {view.habits.length ? <Habits habits={view.habits} today={today} /> : null}
      {tools}
      {mode === "list" ? grouped : spine}
    </>
  );

  if (!split) return list;
  const yearly = view.anytime.filter((t) => t.repeat?.freq === "year");
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: s.s8 }}>{list}</View>
      {/* The day column (b2.html `dayCal`): the date, all-day items, the hour grid and, pinned at
          its foot, what's next. An open task's panel takes its place. */}
      <View style={{ width: sz.schedule, alignSelf: "stretch" }}>
        {panelOpen ? null : (
          <View style={{ gap: s.s2, flex: 1 }}>
            <SectionHead
              title={formatDate(today)}
              right={
                fold !== null || showEarlierHours ? (
                  <Button
                    variant="quiet"
                    label={
                      showEarlierHours
                        ? "Hide earlier hours"
                        : doneEarlier
                          ? `Earlier today, ${doneEarlier} done`
                          : "Earlier today"
                    }
                    onPress={() => setShowEarlierHours(!showEarlierHours)}
                  />
                ) : null
              }
            />
            {yearly.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
                {yearly.map((t) => (
                  <AllDayPill key={t._id} task={t} />
                ))}
              </View>
            ) : null}
            <Timeline
              date={today}
              items={view.scheduled}
              now={now}
              dayStart={view.profile.dayStart}
              dayEnd={view.profile.dayEnd}
              foldBefore={fold}
            />
            {upNext ? (
              <View style={{ position: "sticky", bottom: s.s4, marginTop: s.s2 } as object}>{upNext}</View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

/** The list's now line (b2.html `.now`): the time in red, and the next task when it's close. */
function ListNow({ now, next }: { now: number; next: TaskView | null }) {
  const ahead = next?.time != null ? next.time - now : null;
  const note =
    next && ahead !== null && ahead <= 20 && !next.event
      ? ` · ${next.title} starts in ${formatDuration(ahead)}`
      : "";
  return (
    <View
      aria-label={`Now, ${formatClock(now)}`}
      style={{ flexDirection: "row", alignItems: "center", gap: s.s2, paddingVertical: s.s2 }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.now }} />
      <Txt variant="caption" tone="now" tnum numberOfLines={1} style={{ maxWidth: "80%" }}>
        {`${formatClock(now)}${note}`}
      </Txt>
      <View style={{ flex: 1, height: 1, backgroundColor: c.now }} />
    </View>
  );
}

/** A birthday or another yearly day, heading the day column (b2.html `.allday`). */
function AllDayPill({ task }: { task: TaskView }) {
  return (
    <Press
      role="button"
      accessibilityLabel={`Open ${task.title}`}
      onPress={() => openTask(task._id)}
      hoverBg={c.hover}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        minHeight: 32,
        paddingHorizontal: s.s3,
        borderRadius: r.ctl,
        backgroundColor: c.sunken,
      }}
    >
      <Icon icon={Cake} size={16} tone="ink2" />
      <Txt variant="label" numberOfLines={1}>
        {task.title}
      </Txt>
    </Press>
  );
}

/** The prototype's dotted rule under each row of the day's list (b2.html `.row`). */
function Dotted({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderBottomWidth: 1, borderStyle: "dotted", borderColor: c.lineStrong }}>{children}</View>
  );
}

/** Notion Calendar's "Upcoming in 19 min" with Start focus; while it runs, how long is left. */
function UpNext({ current, next, now }: { current?: TaskView; next?: TaskView; now: number }) {
  // At large text the button goes under the title, so neither is cut short.
  const stacked = useWindowDimensions().fontScale >= 1.3;
  const lead = current ?? next;
  if (!lead || lead.time === null) return null;
  const end = lead.length ? lead.time + lead.length : null;
  const label = current
    ? end !== null
      ? `Now, ${formatDuration(Math.max(1, end - now))} left`
      : "Now"
    : lead.time - now <= 60
      ? `Upcoming in ${formatDuration(Math.max(1, lead.time - now))}`
      : `Next at ${formatClock(lead.time)}`;
  return (
    <View
      aria-label={current ? "Now" : "Up next"}
      style={{
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "flex-start" : "center",
        gap: s.s3,
        padding: s.s4,
        borderRadius: r.card + 4,
        backgroundColor: c.sunken,
      }}
    >
      <View style={stacked ? { alignSelf: "stretch", gap: 2 } : { flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="caption" tone={current ? "now" : "ink3"}>
          {label}
        </Txt>
        <Txt variant="subhead" numberOfLines={2}>
          {lead.title}
        </Txt>
        <Txt variant="meta" tone="ink2" tnum>
          {end !== null
            ? `${formatClock(lead.time)} → ${formatClock(end)}  ${formatDuration(lead.length ?? 0)}`
            : formatClock(lead.time)}
        </Txt>
        {/* With blocks overlapping, the next one may already be running: say until when. */}
        {current && next && next.time !== null ? (
          <Txt variant="meta" tone="ink3" numberOfLines={1} tnum>
            {next.time <= now && next.length !== null
              ? `Then ${next.title}, until ${formatClock(next.time + next.length)}`
              : `Then ${next.title} at ${formatClock(next.time)}`}
          </Txt>
        ) : null}
      </View>
      {lead.event ? null : (
        <Button
          variant="primary"
          icon={Play}
          label={current ? "Focus" : "Start focus"}
          onPress={() => router.push(`/focus/${lead._id}`)}
          style={{ borderRadius: r.pill, paddingHorizontal: s.s4 }}
        />
      )}
    </View>
  );
}

function Habits({ habits, today }: { habits: TodayView["habits"]; today: string }) {
  const check = useMutation(api.organize.checkHabit).withOptimisticUpdate((store, { id, done }) => {
    const current = store.getQuery(api.views.today, { today });
    if (!current) return;
    store.setQuery(
      api.views.today,
      { today },
      {
        ...current,
        habits: current.habits.map((h) =>
          h._id === id ? { ...h, doneToday: done, thisWeek: h.thisWeek + (done ? 1 : -1) } : h,
        ),
      },
    );
  });
  const phone = useIsPhone();
  return (
    <View aria-label="Habits today" style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s4 }}>
      {habits.map((h) => {
        const tone = spaceTone(h.color ?? "green");
        return (
          <Press
            key={h._id}
            role="switch"
            aria-checked={h.doneToday}
            accessibilityLabel={`${h.title}, ${h.thisWeek} of ${h.target} this week`}
            onPress={() => {
              toggleHaptic(!h.doneToday);
              void check({ id: h._id, done: !h.doneToday, date: today });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s.s2,
              height: phone ? 44 : 32,
              paddingHorizontal: s.s2,
              marginHorizontal: -s.s2,
              borderRadius: 8,
            }}
          >
            <Ring color={tone.dot} done={h.doneToday} size={phone ? 20 : 16} />
            <Txt variant="label" tone="ink2">
              {h.title}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

function Earlier({ tasks, today }: { tasks: TaskView[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const pickRef = useRef<View>(null);
  return (
    // B2's disclosure: "2 from earlier ⌄" opens the rows, each with its own move, and the two
    // moves for all of them on one line under it.
    <View style={{ gap: s.s1 }}>
      <View style={{ flexDirection: "row" }}>
        <Button
          variant="quiet"
          label={`${tasks.length} from earlier`}
          trailing={open ? ChevronDown : ChevronRight}
          expanded={open}
          onPress={() => setOpen(!open)}
          style={{ marginLeft: -s.s3 }}
        />
      </View>
      {open ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
            <Button label="Move all to today" onPress={() => void moveTasks(tasks, today)} />
            <Button ref={pickRef} label="Pick a day" onPress={() => setPicking(true)} />
          </View>
          <View>
            {tasks.map((t) => (
              <Dotted key={t._id}>
                <TaskRow task={t} today={today} showWhen movable />
              </Dotted>
            ))}
          </View>
        </>
      ) : null}
      <Popover
        open={picking}
        onClose={() => setPicking(false)}
        anchor={pickRef}
        title={`Move ${tasks.length} to a day`}
      >
        <DayPicker
          value={null}
          today={today}
          allowNone={false}
          onPick={(date) => {
            setPicking(false);
            if (date) void moveTasks(tasks, date);
          }}
        />
      </Popover>
    </View>
  );
}

function TodaySkeleton() {
  return (
    <View testID="skeleton" aria-busy style={{ gap: s.s12 }}>
      <View style={{ gap: s.s3 }}>
        <Skeleton width={120} height={12} />
        <Skeleton width="70%" height={28} />
        <Skeleton width="100%" height={2} />
      </View>
      <View style={{ gap: s.s4 }}>
        <Skeleton width={140} height={16} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: "row", gap: s.s3, alignItems: "center" }}>
            <Skeleton width={18} height={18} style={{ borderRadius: 9 }} />
            <Skeleton width={`${60 - i * 8}%`} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

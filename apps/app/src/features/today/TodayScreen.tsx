// Today (docs/design/v4, b2.html?screen=today): the black header with the day in one sentence,
// the week, what agents did, what's next with Start focus, then the day as a list grouped by
// part of the day (habits among the anytime things) or as the spine timeline. Desktop: the
// header card heads a centred column with the ask bar at its foot; on a window wide enough,
// the day's hours sit in a column on the right with what's next pinned at its foot.

import { DottedRule } from "@/ui/DottedRule";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Platform, RefreshControl, useWindowDimensions, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useMutation } from "convex/react";
import {
  Check as CheckIcon,
  ChevronDown,
  ChevronRight,
  Clock,
  ListChecks,
  Moon,
  Plus,
  Sun,
  Sunset,
  type LucideIcon,
} from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { formatClock } from "@kriyan/core/dates";
import { formatDuration } from "@kriyan/core/format";
import { freeMinutes } from "@kriyan/core/layout";
import { SPLIT_MIN_WIDTH } from "@kriyan/core/tokens";
import { useClock } from "@/data/time";
import { useInboxView, useProfile, useTodayView, type TaskView, type TodayView } from "@/data/views";
import { AskBox } from "@/features/ask/AskBar";
import { closedDay } from "@/features/review/closedDay";
import { moveTasks, placeTasks } from "@/features/tasks/actions";
import { toggleHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { Segmented } from "@/features/tasks/Segmented";
import { TaskRow } from "@/features/tasks/TaskRow";
import { useControl, useIsPhone } from "@/theme/layout";
import { c, family, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Ring, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { Notice, Screen, SplitScreen } from "@/ui/Screen";
import { LightStatusBar } from "@/ui/statusBar";
import { Txt } from "@/ui/Txt";
import { AgentNote } from "./AgentNote";
import { DayColumn } from "./DayColumn";
import { dayRows, type DayRow } from "./dayRows";
import { measureSlots, registerDropZone } from "./drag";
import { DragGhost } from "./DragGhost";
import { DragSource } from "./DragSource";
import { PlanToday } from "./PlanToday";
import { ReviewCard } from "./ReviewCard";
import { FreeGap, Spine } from "./Spine";

import { TodayHeader } from "./TodayHeader";
import { UpNext, upNextOf } from "./UpNext";
import { WeekStrip } from "./WeekStrip";

export function TodayScreen() {
  const view = useTodayView();
  const { today, now } = useClock();
  const phone = useIsPhone();
  const { width } = useWindowDimensions();
  const inbox = useInboxView();
  const [planning, setPlanning] = useState(false);
  const planRef = useRef<View>(null);
  // The day's hours get their own column when the list still has room beside it.
  const split = !phone && width >= SPLIT_MIN_WIDTH;

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

  const body =
    view === undefined ? (
      <TodaySkeleton />
    ) : (
      <TodayBody
        view={view}
        today={today}
        now={now}
        split={split}
        planButton={planButton}
        onAdd={() => router.push("/add")}
      />
    );

  const plan = view ? (
    <PlanToday
      open={planning}
      onClose={() => setPlanning(false)}
      anchor={planRef}
      today={today}
      earlier={view.earlier}
      inbox={inbox ?? []}
      free={free ?? 0}
    />
  ) : null;

  if (!phone) {
    return (
      <View style={{ flex: 1 }}>
        <SplitScreen
          title="Today"
          right={split && view ? <DayColumn view={view} today={today} now={now} /> : null}
          footer={<AskBox />}
        >
          {header}
          {/* B2's `.sheet-d`: the list sits a little in from the header card's edges. */}
          <View style={{ paddingTop: s.s4, paddingHorizontal: s.s1 }}>{body}</View>
        </SplitScreen>
        <DragGhost />
        {plan}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <LightStatusBar enabled={!pastHead} />
      <Screen
        title="Today"
        hero={
          header ? <View onLayout={(e) => setHeadHeight(e.nativeEvent.layout.height)}>{header}</View> : null
        }
        scrollProps={scrollProps}
        pastHero={pastHead}
      >
        {body}
      </Screen>
      <DragGhost />
      {plan}
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
  { title: "Morning", to: 12 * 60, icon: Sun },
  { title: "Afternoon", to: 17 * 60, icon: Sunset },
  { title: "Evening", to: 24 * 60, icon: Moon },
] as const;

const partOf = (minutes: number) => PARTS.find((p) => minutes < p.to) ?? PARTS[2];

/** "Review today" shows at this time when the person hasn't picked one (Settings). */
const DEFAULT_REVIEW = 20 * 60;

function TodayBody({
  view,
  today,
  now,
  split,
  planButton,
  onAdd,
}: {
  view: TodayView;
  today: string;
  now: number;
  /** Desktop with the day column beside the list: what's next is pinned there instead. */
  split: boolean;
  planButton: ReactNode;
  onAdd: () => void;
}) {
  const phone = useIsPhone();
  const profile = useProfile();
  const closed = closedDay.useValue((d) => d) === today;
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
      <View>
        <WeekStrip today={today} />
        <AgentNote />
        <Notice
          title="Nothing planned for today"
          body="Add what's on your mind, like “call the bank tomorrow 10am”. Anything without a date waits in your Inbox."
          action={<Button icon={Plus} label="Add your first task" onPress={onAdd} />}
        />
      </View>
    );
  }

  const live = view.scheduled.filter((t) => !t.done && !t.proposedBy);
  const { current, next } = upNextOf(view, now);
  const left = view.due.length + view.anytime.length;
  const cleared =
    left === 0 &&
    live.every((t) => (t.time ?? 0) + (t.length ?? 0) <= now) &&
    (view.done.length > 0 || view.scheduled.some((t) => t.done));
  // The card waits at the review time until the day is closed (b2.html `rvcardtoday`).
  const reviewAt = closed ? null : (profile?.reviewTime ?? DEFAULT_REVIEW);
  const anytimeCount = left + view.done.length + view.habits.length;

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
      {view.habits.length ? <HabitRows habits={view.habits} today={today} /> : null}
      {view.done.map((t) => (
        <Dotted key={`${t._id}:${t.date}:done`}>
          <TaskRow task={t} today={today} />
        </Dotted>
      ))}
    </View>
  );

  // The timed rows, grouped into parts of the day, with free stretches, the now line and the
  // review card between them.
  const groups: { part: (typeof PARTS)[number]; rows: DayRow[] }[] = [];
  for (const row of dayRows(view.scheduled, { now, dayStart: view.profile.dayStart, reviewAt })) {
    const part = partOf(row.kind === "now" ? (row.next?.time ?? row.at) : row.at);
    const last = groups.at(-1);
    if (last?.part === part) last.rows.push(row);
    else groups.push({ part, rows: [row] });
  }

  const grouped = (
    <View>
      {view.earlier.length ? <Earlier tasks={view.earlier} today={today} /> : null}
      {anytimeCount || cleared ? (
        <View>
          <GroupLabel icon={Clock} title="Anytime" count={anytimeCount} />
          {cleared && view.earlier.length === 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, paddingVertical: s.s2 }}>
              <Icon icon={CheckIcon} tone="ink2" />
              <Txt variant="body" tone="ink2">
                Nothing left today.
              </Txt>
            </View>
          ) : null}
          {anytimeRows}
        </View>
      ) : null}
      {groups.map((g) => (
        <View key={g.part.title}>
          <GroupLabel
            icon={g.part.icon}
            title={g.part.title}
            count={g.rows.filter((row) => row.kind === "task").length}
          />
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
    <View style={{ marginTop: s.s3 }}>
      <Spine
        droppable={phone}
        date={today}
        items={view.scheduled}
        now={now}
        dayStart={view.profile.dayStart}
        reviewAt={reviewAt}
      />
    </View>
  );

  const tools = (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: s.s2, flexWrap: "wrap", marginTop: s.s4 }}
    >
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
        // B2's quiet link; its label, not its padding, lines up with the column's edge.
        <Button
          variant="quiet"
          label="Close the day"
          onPress={() => router.push("/review")}
          style={{ marginRight: -s.s3 }}
        />
      )}
    </View>
  );

  return (
    // One sequence with B2's short steps between its parts, not the page's section gaps.
    <View>
      <WeekStrip today={today} />
      <AgentNote />
      {/* Desktop with the day column pins what's next at the column's foot instead. */}
      {split || !(current || next) ? null : (
        <View style={{ marginTop: s.s3 }}>
          <UpNext current={current} next={next} now={now} />
        </View>
      )}
      {tools}
      {mode === "list" ? grouped : spine}
    </View>
  );
}

/** B2's group label (`.gh`): a small icon, then "ANYTIME (6)" in quiet small capitals. */
function GroupLabel({ icon, title, count }: { icon: LucideIcon; title: string; count: number }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 28, marginTop: s.s4 }}
      accessibilityLabel={`${title}, ${count}`}
    >
      <Icon icon={icon} size={16} />
      <Txt variant="caption" tone="ink3" heading={2} tnum style={groupText}>
        {`${title} (${count})`}
      </Txt>
    </View>
  );
}

/** 0.05em at 12px: small capitals crowd together without it. */
const groupText = { ...family("600"), textTransform: "uppercase" as const, letterSpacing: 0.6 };

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

/** The prototype's dotted rule under each row of the day's list (b2.html `.row`). */
function Dotted({ children }: { children: ReactNode }) {
  return (
    <View>
      {children}
      <DottedRule />
    </View>
  );
}

/**
 * Habits due today, as rows among the anytime things (B2 lists them with the day, not in a
 * strip of their own). The dashed ring fills once today's check-in is in.
 */
function HabitRows({ habits, today }: { habits: TodayView["habits"]; today: string }) {
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
  const { row } = useControl();
  return (
    <>
      {habits.map((h) => {
        const tone = spaceTone(h.color ?? "green");
        return (
          <Dotted key={h._id}>
            <Press
              role="switch"
              aria-checked={h.doneToday}
              accessibilityLabel={`${h.title}, ${h.thisWeek} of ${h.target} this week`}
              onPress={() => {
                toggleHaptic(!h.doneToday);
                void check({ id: h._id, done: !h.doneToday, date: today });
              }}
              hoverBg={c.hover}
              scale={false}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s.s3,
                minHeight: row,
                paddingVertical: phone ? s.s1 : s.s2,
                paddingHorizontal: s.s2,
                marginHorizontal: -s.s2,
                borderRadius: r.ctl,
              }}
            >
              {/* The same width as a task's checkbox, so the titles line up. */}
              <View style={{ width: 16, alignItems: "center" }}>
                <Ring color={tone.dot} done={h.doneToday} size={16} dashed />
              </View>
              <Txt variant="body" tone={h.doneToday ? "ink3" : "ink"} style={{ flex: 1 }} numberOfLines={1}>
                {h.title}
              </Txt>
              <Txt variant="meta" tone="ink3" tnum>
                {`${h.thisWeek} of ${h.target} this week`}
              </Txt>
            </Press>
          </Dotted>
        );
      })}
    </>
  );
}

function Earlier({ tasks, today }: { tasks: TaskView[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const pickRef = useRef<View>(null);
  return (
    // B2's disclosure: "2 from earlier ⌄" opens the rows, each with its own move, and the two
    // moves for all of them on one line under it.
    <View style={{ gap: s.s1, marginTop: s.s4 }}>
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

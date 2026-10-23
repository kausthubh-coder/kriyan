// Today (docs/design/v4, b2.html?screen=today): the black header with the day in one sentence,
// the week, what's next with Start focus, habits, then the day as a list grouped by part of the
// day or as a timeline. On a desktop wide enough, the timeline sits beside the list.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import { Check as CheckIcon, ListChecks, Moon, Play, Plus } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { formatClock } from "@kriyan/core/dates";
import { formatDuration } from "@kriyan/core/format";
import { freeMinutes } from "@kriyan/core/layout";
import { SPLIT_MIN_WIDTH } from "@kriyan/core/tokens";
import { useClock } from "@/data/time";
import { useInboxView, useTodayView, type TaskView, type TodayView } from "@/data/views";
import { moveTasks } from "@/features/tasks/actions";
import { toggleHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { QuickAdd, type QuickAddHandle } from "@/features/tasks/QuickAdd";
import { TaskRow } from "@/features/tasks/TaskRow";
import { quickAddTarget } from "@/features/shell/context";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, spaceTone, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Ring, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { Notice, Screen, SectionHead, usePanelOpen } from "@/ui/Screen";
import { Txt } from "@/ui/Txt";
import { DragGhost } from "./DragGhost";
import { DragSource } from "./DragSource";
import { PlanToday } from "./PlanToday";
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
  const planButton = toPlan ? (
    <Button
      ref={planRef}
      icon={ListChecks}
      label="Plan today"
      accessibilityLabel="Plan today"
      onPress={() => setPlanning(true)}
    />
  ) : null;
  const add = phone ? null : <QuickAdd ref={quickAdd} variant="inline" defaultDate={today} />;
  const header = view ? <TodayHeader view={view} today={today} now={now} free={free} /> : null;
  // Desktop: the header card heads the column (or the list, when the timeline sits beside it).
  const head = phone ? null : header;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Today"
        hero={header}
        fab
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
  { title: "Morning", from: 0, to: 12 * 60 },
  { title: "Afternoon", from: 12 * 60, to: 17 * 60 },
  { title: "Evening", from: 17 * 60, to: 24 * 60 },
] as const;

/** When the "Review today" card appears: two and a half hours before the day ends. */
const REVIEW_BEFORE_END = 150;

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
  const [showEarlierHours, setShowEarlierHours] = useState(false);
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
        {phone ? <WeekStrip today={today} /> : null}
        {add}
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
  // The count is what closeDay moves: not a task that's only due today, an event, a proposal or
  // a repeat's projected copy.
  const stillOpen = [...view.anytime, ...view.scheduled].filter(
    (t) => !t.done && !t.event && !t.proposedBy && !t.projected,
  ).length;
  const reviewTime = view.profile.dayEnd - REVIEW_BEFORE_END;
  // Hours before an hour ago fold away, but never over a block that slipped: it stays in
  // sight until it's ticked off or moved.
  const slipped = view.scheduled.filter(
    (t) => !t.done && !t.event && !t.proposedBy && !t.projected && t.time !== null && t.time < now - 60,
  );
  const foldAt = Math.min(now - 60, ...slipped.map((t) => t.time ?? now));
  const fold = !showEarlierHours && foldAt > view.profile.dayStart ? foldAt : null;
  const doneEarlier = view.scheduled.filter((t) => t.done && (t.time ?? 0) < (fold ?? 0)).length;
  // Beside the timeline (split) the list is always the list; otherwise the person picks.
  const showList = split || mode === "list";

  const anytimeRows = (
    <View>
      {[...view.due, ...view.anytime].map((t) => (
        <TaskRow
          key={`${t._id}:${t.date}`}
          task={t}
          today={today}
          movable
          wrap={(row) => (
            <DragSource taskId={t._id} title={t.title} color={spaceTone(t.color).dot} length={t.length}>
              {row}
            </DragSource>
          )}
        />
      ))}
      {view.done.map((t) => (
        <TaskRow key={`${t._id}:${t.date}:done`} task={t} today={today} />
      ))}
    </View>
  );

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
      {split
        ? null
        : PARTS.map((part) => {
            const items = view.scheduled.filter(
              (t) => t.time !== null && t.time >= part.from && t.time < part.to,
            );
            if (!items.length) return null;
            return (
              <View key={part.title} style={{ gap: s.s1 }}>
                <SectionHead title={part.title} meta={`${items.length}`} />
                <View>
                  {items.map((t) => (
                    <TaskRow key={`${t._id}:${t.date}`} task={t} today={today} movable clock />
                  ))}
                </View>
              </View>
            );
          })}
    </View>
  );

  const schedule = (
    <View style={{ gap: s.s2 }}>
      <SectionHead
        title="Schedule"
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
      <Timeline
        date={today}
        items={view.scheduled}
        now={now}
        dayStart={view.profile.dayStart}
        dayEnd={view.profile.dayEnd}
        foldBefore={fold}
      />
    </View>
  );

  const tools = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, flexWrap: "wrap" }}>
      {split ? null : (
        <Segmented
          value={mode}
          options={[
            { value: "list", label: "List" },
            { value: "timeline", label: "Timeline" },
          ]}
          onChange={setMode}
        />
      )}
      <View style={{ flex: 1 }} />
      {planButton}
      {/* The phone gets the evening review card instead of a button that's there all day. */}
      {stillOpen && !phone ? (
        <Button icon={Moon} label="Close the day" onPress={() => router.push("/review")} />
      ) : null}
    </View>
  );

  const list = (
    <>
      {head}
      {phone ? <WeekStrip today={today} /> : null}
      {add}
      {current || next ? <UpNext current={current} next={next} now={now} /> : null}
      {view.habits.length ? <Habits habits={view.habits} today={today} /> : null}
      {tools}
      {showList ? grouped : null}
      {now >= reviewTime && stillOpen ? <ReviewCard open={stillOpen} /> : null}
    </>
  );

  if (!split) {
    return (
      <>
        {list}
        {showList ? null : schedule}
      </>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: s.s8 }}>{list}</View>
      <View style={{ width: sz.schedule }}>{panelOpen ? null : schedule}</View>
    </View>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View
      role="radiogroup"
      style={{ flexDirection: "row", backgroundColor: c.sunken, borderRadius: r.ctl + 2, padding: 2 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            role="radio"
            aria-checked={on}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            hoverBg={null}
            style={{
              minHeight: 40,
              paddingHorizontal: s.s3,
              justifyContent: "center",
              borderRadius: r.ctl,
              backgroundColor: on ? c.raised : "transparent",
              ...(on ? { boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : {}),
            }}
          >
            <Txt variant="label" tone={on ? "ink" : "ink3"}>
              {o.label}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** Notion Calendar's "Upcoming in 19 min" with Start focus; while it runs, how long is left. */
function UpNext({ current, next, now }: { current?: TaskView; next?: TaskView; now: number }) {
  const lead = current ?? next;
  if (!lead || lead.time === null) return null;
  const end = lead.length ? lead.time + lead.length : null;
  const label = current
    ? end !== null
      ? `Now, ${formatDuration(Math.max(1, end - now))} left`
      : "Now"
    : lead.time - now <= 120
      ? `Upcoming in ${formatDuration(Math.max(1, lead.time - now))}`
      : `Next, at ${formatClock(lead.time)}`;
  return (
    <View
      aria-label={current ? "Now" : "Up next"}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        padding: s.s4,
        borderRadius: r.card + 4,
        backgroundColor: c.sunken,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
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
        />
      )}
    </View>
  );
}

/** Tiimo's evening card: the day's review, offered at the review time, never forced. */
function ReviewCard({ open }: { open: number }) {
  return (
    <View
      style={{
        gap: s.s3,
        padding: s.s4,
        borderRadius: r.card + 4,
        backgroundColor: c.sunken,
      }}
    >
      <View style={{ gap: 2 }}>
        <Txt variant="subhead">Review today</Txt>
        <Txt variant="body" tone="ink2">
          {open === 1 ? "1 thing is still open." : `${open} things are still open.`} Give each one a place,
          then stop thinking about it.
        </Txt>
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button variant="primary" icon={Moon} label="Review today" onPress={() => router.push("/review")} />
      </View>
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
    <View style={{ gap: s.s1 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: s.s2 }}>
        <Button
          variant="quiet"
          label={`${tasks.length} from earlier`}
          expanded={open}
          onPress={() => setOpen(!open)}
          style={{ marginLeft: -s.s3 }}
        />
        <Button label="Move to today" onPress={() => void moveTasks(tasks, today)} />
        <Button ref={pickRef} label="Pick a day" onPress={() => setPicking(true)} />
      </View>
      {open ? (
        <View>
          {tasks.map((t) => (
            <TaskRow key={t._id} task={t} today={today} showWhen movable />
          ))}
        </View>
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
